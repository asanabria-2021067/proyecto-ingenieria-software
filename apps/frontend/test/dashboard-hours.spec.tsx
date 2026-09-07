import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardStats } from '@/lib/services/users';

// VIEW-08 (F018): horas en proyectos abiertos vs. horas acreditadas, SEPARADAS.
// Misma estrategia de aislamiento que `dashboard-featured.spec.tsx`.

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
vi.mock('@/components/profile/CompleteProfileDialog', () => ({ default: () => null }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Ana', perfil: null, habilidades: [] }, isLoading: false }),
  isProfileIncomplete: () => false,
}));
vi.mock('@/hooks/use-social', () => ({
  useFeedSocial: () => ({ proyectosDeAmigos: [], proyectosDeSeguidos: [] }),
}));

const getDashboardStatsMock = vi.fn();
vi.mock('@/lib/services/users', () => ({
  getDashboardStats: () => getDashboardStatsMock(),
}));
vi.mock('@/lib/services/projects', () => ({
  searchProjects: () => Promise.resolve([]),
}));
vi.mock('@/lib/api/client', () => ({
  apiFetch: () => Promise.resolve([]),
}));

function stats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    horasBeca: 0,
    horasBecaRequeridas: null,
    horasExtension: 0,
    horasExtensionRequeridas: null,
    horasTotal: 0,
    proyectosActivos: 2,
    postulacionesRecientes: [],
    horasRegistradasEnProyectosAbiertos: '12.50',
    horasAcreditadas: '40.00',
    ...overrides,
  };
}

async function renderDashboard() {
  const { default: DashboardPage } = await import('@/app/dashboard/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getDashboardStatsMock.mockResolvedValue(stats());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Dashboard — horas abiertas y acreditadas (VIEW-08 / F018)', () => {
  it('muestra las horas abiertas y las acreditadas por separado, con el string del backend formateado sin recálculo', async () => {
    await renderDashboard();

    const abiertas = await screen.findByRole('group', { name: 'Horas registradas en proyectos abiertos' });
    const acreditadas = screen.getByRole('group', { name: 'Horas acreditadas' });
    expect(within(abiertas).getByText('12.5')).toBeInTheDocument();
    expect(within(acreditadas).getByText('40')).toBeInTheDocument();
    expect(within(abiertas).queryByText('40')).not.toBeInTheDocument();
  });

  it('no existe un KPI que sume abiertas y acreditadas', async () => {
    await renderDashboard();
    await screen.findByRole('group', { name: 'Horas acreditadas' });

    expect(screen.queryByText('52.5')).not.toBeInTheDocument();
    expect(screen.queryByText('52.50')).not.toBeInTheDocument();
    expect(screen.queryByText(/horas totales/i)).not.toBeInTheDocument();
  });

  it('cada métrica explica su significado con un tooltip accesible', async () => {
    await renderDashboard();
    await screen.findByRole('group', { name: 'Horas acreditadas' });

    expect(screen.getByRole('button', { name: 'Qué significa: Horas registradas en proyectos abiertos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qué significa: Horas acreditadas' })).toBeInTheDocument();
    expect(screen.getByText(/Pueden cambiar hasta que el proyecto se cierre/)).toBeInTheDocument();
    expect(screen.getByText(/Ya no cambian/)).toBeInTheDocument();
  });

  it('si el bloque de horas no viene, el resto del dashboard se renderiza igual', async () => {
    getDashboardStatsMock.mockResolvedValue(
      stats({ horasRegistradasEnProyectosAbiertos: undefined, horasAcreditadas: undefined }),
    );
    await renderDashboard();

    await waitFor(() => expect(screen.getByText('Proyectos Disponibles')).toBeInTheDocument());
    expect(screen.getByText('Proyectos Activos')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    const abiertas = screen.getByRole('group', { name: 'Horas registradas en proyectos abiertos' });
    expect(within(abiertas).getByText('No disponible por ahora')).toBeInTheDocument();
    expect(within(abiertas).queryByText('0')).not.toBeInTheDocument();
  });
});
