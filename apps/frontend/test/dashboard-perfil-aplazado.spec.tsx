import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

window.matchMedia =
  window.matchMedia ||
  ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

vi.mock('@/components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Doble del asistente: solo expone el aplazamiento que usa la página.
vi.mock('@/components/profile/CompleteProfileDialog', () => ({
  default: ({ open, onDefer }: { open: boolean; onDefer?: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Completa tu perfil">
        <button onClick={onDefer}>Hacerlo después</button>
      </div>
    ) : null,
}));
vi.mock('@/hooks/use-current-user', () => {
  const KEY = 'perfil_asistente_pospuesto';
  return {
    PERFIL_POSPUESTO_KEY: KEY,
    perfilPospuesto: (id: number) => sessionStorage.getItem(KEY) === String(id),
    isProfileIncomplete: () => true,
    useCurrentUser: () => ({
      data: {
        idUsuario: 7,
        nombre: 'Ana',
        fotoUrl: null,
        perfil: { biografia: 'Hola', githubUrl: null, linkedinUrl: null, enlacePortafolio: null, urlCv: null },
        habilidades: [],
        intereses: [],
        cualidades: [],
      },
      isLoading: false,
    }),
  };
});
vi.mock('@/hooks/use-social', () => ({
  useFeedSocial: () => ({ proyectosDeAmigos: [], proyectosDeSeguidos: [] }),
}));
vi.mock('@/lib/services/users', () => ({
  getDashboardStats: () =>
    Promise.resolve({
      horasBeca: 0,
      horasBecaRequeridas: null,
      horasExtension: 0,
      horasExtensionRequeridas: null,
      horasTotal: 0,
      proyectosActivos: 0,
      postulacionesRecientes: [],
    }),
  getMisTareas: () => Promise.resolve([]),
}));
vi.mock('@/lib/services/projects', () => ({ searchProjects: () => Promise.resolve([]) }));
vi.mock('@/lib/api/client', () => ({ apiFetch: () => Promise.resolve([]) }));

async function renderDashboard() {
  const { default: DashboardPage } = await import('@/app/dashboard/page');
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => cleanup());

describe('Dashboard - asistente de perfil aplazado', () => {
  it('"Hacerlo después" cierra el diálogo, muestra la tarjeta con % y "Completar perfil" lo reabre', async () => {
    const onEvento = vi.fn();
    window.addEventListener('perfil-asistente-pospuesto', onEvento);
    await renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Hacerlo después' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem('perfil_asistente_pospuesto')).toBe('7');
    expect(onEvento).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tu perfil está al 17%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Completar perfil' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/Tu perfil está al/)).toBeNull();
    window.removeEventListener('perfil-asistente-pospuesto', onEvento);
  });

  it('el aplazamiento de otro usuario en la misma pestaña no aplica', async () => {
    sessionStorage.setItem('perfil_asistente_pospuesto', '99');
    await renderDashboard();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
