import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

// Regresión: el conteo de "proyectos disponibles" del hero y de la pestaña
// "Disponibles" usaban projects.length DESPUÉS de recortar el array a 4 para
// las tarjetas — así que nunca podían mostrar más de "4", sin importar
// cuántos proyectos hubiera de verdad. Este test usa más de 4 para probar
// que el conteo es el total real, no el de tarjetas visibles.

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
vi.mock('@/components/profile/CompleteProfileDialog', () => ({ default: () => null }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: { idUsuario: 1, nombre: 'Ana', perfil: null, habilidades: [] },
    isLoading: false,
  }),
  isProfileIncomplete: () => false,
}));
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
vi.mock('@/lib/api/client', () => ({ apiFetch: () => Promise.resolve([]) }));

function proyecto(overrides: Partial<ProyectoListItemDTO> = {}): ProyectoListItemDTO {
  return {
    idProyecto: 1,
    tituloProyecto: 'Proyecto',
    descripcionProyecto: 'Descripcion',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'VIRTUAL',
    organizaciones: [],
    intereses: [],
    _count: { roles: 1 },
    ...overrides,
  } as ProyectoListItemDTO;
}

const SIETE_PROYECTOS = Array.from({ length: 7 }, (_, i) =>
  proyecto({ idProyecto: i + 1, tituloProyecto: `Proyecto ${i + 1}` }),
);

vi.mock('@/lib/services/projects', () => ({
  searchProjects: () => Promise.resolve(SIETE_PROYECTOS),
}));

async function renderDashboard() {
  const { default: DashboardPage } = await import('@/app/dashboard/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('Dashboard — conteo real de proyectos disponibles', () => {
  it('el hero y la pestaña "Disponibles" muestran el total real (7), no el recorte de tarjetas (4)', async () => {
    await renderDashboard();

    expect(await screen.findByText(/Tienes/)).toBeInTheDocument();
    expect(screen.getByText('7 proyectos')).toBeInTheDocument();

    const botonDisponibles = screen.getByRole('button', { name: /Disponibles/ });
    expect(botonDisponibles).toHaveTextContent('7');
  });

  it('solo renderiza 4 tarjetas en la pestaña "Disponibles", aunque haya 7', async () => {
    await renderDashboard();

    const botonDisponibles = await screen.findByRole('button', { name: /Disponibles/ });
    fireEvent.click(botonDisponibles);

    expect(await screen.findByText('Proyecto 1')).toBeInTheDocument();
    expect(screen.getByText('Proyecto 4')).toBeInTheDocument();
    expect(screen.queryByText('Proyecto 5')).not.toBeInTheDocument();
  });
});
