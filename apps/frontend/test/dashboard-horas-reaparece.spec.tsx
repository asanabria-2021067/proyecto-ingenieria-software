import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('@/components/hours/semestre-horas-card', () => ({ SemestreHorasCard: () => null }));
const estado = vi.hoisted(() => ({ perfilIncompleto: false, necesitaRegistro: true }));
vi.mock('@/hooks/use-horas-semestre', () => ({
  useHorasActual: () => ({ data: { necesitaRegistro: estado.necesitaRegistro } }),
}));
// Doble del asistente: expone solo si se pidio el paso unico de horas.
vi.mock('@/components/profile/CompleteProfileDialog', () => ({
  default: ({ open, soloHoras }: { open: boolean; soloHoras?: boolean }) =>
    open ? <div role="dialog" aria-label={soloHoras ? 'solo horas' : 'asistente completo'} /> : null,
}));
vi.mock('@/hooks/use-current-user', () => ({
  PERFIL_POSPUESTO_KEY: 'perfil_asistente_pospuesto',
  perfilPospuesto: (id: number) => sessionStorage.getItem('perfil_asistente_pospuesto') === String(id),
  isProfileIncomplete: () => estado.perfilIncompleto,
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
}));
vi.mock('@/hooks/use-social', () => ({
  useFeedSocial: () => ({ proyectosDeAmigos: [], proyectosDeSeguidos: [] }),
}));
vi.mock('@/lib/services/users', () => ({
  getDashboardStats: () =>
    Promise.resolve({ horasBeca: 0, horasBecaRequeridas: null, horasExtension: 0, horasExtensionRequeridas: null, horasTotal: 0, proyectosActivos: 0, postulacionesRecientes: [] }),
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

beforeEach(() => {
  sessionStorage.clear();
  estado.perfilIncompleto = false;
  estado.necesitaRegistro = true;
});
afterEach(() => cleanup());

describe('Dashboard - el asistente reaparece si falta el registro de horas del semestre', () => {
  it('perfil completo y sin registro del semestre: abre solo el paso de horas', async () => {
    await renderDashboard();
    expect(await screen.findByRole('dialog', { name: 'solo horas' })).toBeInTheDocument();
  });

  it('perfil incompleto y sin registro: abre el asistente completo (que ya incluye las horas)', async () => {
    estado.perfilIncompleto = true;
    await renderDashboard();
    expect(await screen.findByRole('dialog', { name: 'asistente completo' })).toBeInTheDocument();
  });

  it('con registro del semestre y perfil completo no se abre', async () => {
    estado.necesitaRegistro = false;
    await renderDashboard();
    await screen.findByText(/Hola, Ana/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si el usuario lo aplazo en esta pestana no vuelve a abrirse', async () => {
    sessionStorage.setItem('perfil_asistente_pospuesto', '7');
    await renderDashboard();
    await screen.findByText(/Hola, Ana/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
