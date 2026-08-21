import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardStats } from '@/lib/services/users';
import type { ProyectoResumen } from '@/types';

// Component tests for HU-59 (T-104/T-234): seccion "Proyectos Destacados" en
// el dashboard. Se aisla DashboardPage de sus dependencias pesadas
// (DashboardLayout, CompleteProfileDialog) para probar solo el
// comportamiento de la seccion de destacados.

// jsdom no implementa matchMedia; embla-carousel (usado por <Carousel>) lo
// requiere al montarse.
window.matchMedia =
  window.matchMedia ||
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList);

(globalThis as any).IntersectionObserver =
  (globalThis as any).IntersectionObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

(globalThis as any).ResizeObserver =
  (globalThis as any).ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

vi.mock('@/components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/profile/CompleteProfileDialog', () => ({
  default: () => null,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      idUsuario: 1,
      nombre: 'Ana',
      perfil: null,
      habilidades: [],
    },
    isLoading: false,
  }),
  isProfileIncomplete: () => false,
}));

vi.mock('@/lib/services/users', () => ({
  getDashboardStats: (): Promise<DashboardStats> =>
    Promise.resolve({
      horasBeca: 0,
      horasBecaRequeridas: null,
      horasExtension: 0,
      horasExtensionRequeridas: null,
      horasTotal: 0,
      proyectosActivos: 0,
      postulacionesRecientes: [],
    }),
}));

vi.mock('@/lib/services/projects', () => ({
  searchProjects: () => Promise.resolve([]),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

async function renderDashboard() {
  const { default: DashboardPage } = await import('@/app/dashboard/page');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

function proyectoResumen(overrides: Partial<ProyectoResumen> = {}): ProyectoResumen {
  return {
    idProyecto: 1,
    tituloProyecto: 'Proyecto destacado',
    descripcionProyecto: 'Descripcion',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'VIRTUAL',
    organizaciones: [],
    intereses: [],
    _count: { roles: 2 },
    ...overrides,
  };
}

describe('Dashboard - seccion Proyectos Destacados', () => {
  it('no muestra la seccion cuando no hay proyectos destacados', async () => {
    apiFetchMock.mockResolvedValue([]);

    await renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText('Proyectos Disponibles')).toBeInTheDocument();
    });

    expect(screen.queryByText('Proyectos Destacados')).not.toBeInTheDocument();
  });

  it('el clic en una tarjeta destacada navega al detalle del proyecto', async () => {
    apiFetchMock.mockResolvedValue([
      proyectoResumen({ idProyecto: 42, tituloProyecto: 'Robotica UVG' }),
    ]);

    await renderDashboard();

    const card = await screen.findByRole('link', { name: /Robotica UVG/i });
    expect(card).toHaveAttribute('href', '/dashboard/proyectos/42');
  });
});
