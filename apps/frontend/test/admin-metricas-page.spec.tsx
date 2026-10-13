import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Página propia de «Tendencias de uso» (`/dashboard/admin/metricas`): se sirve
 * dentro del shell administrativo, que es quien restringe el acceso, y lee el
 * mismo `GET /admin/metricas` que la sección del panel.
 */

const RUTA = '/dashboard/admin/metricas';

const replaceMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { idUsuario: number; roles: string[] } | undefined,
    isLoading: false,
    isError: false,
  })),
);

vi.mock('next/navigation', () => ({
  usePathname: () => RUTA,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: (props: { alt: string }) => createElement('img', { alt: props.alt }) }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).some((r) => r.toLowerCase() === 'administrador'),
}));
vi.mock('../hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('../hooks/use-cuentas-pendientes', () => ({ useCuentasPendientes: () => ({ data: undefined }) }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
// El shell de estudiante no debe usarse nunca para esta ruta.
vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: () => createElement('div', { 'data-testid': 'shell-estudiante' }),
}));
vi.mock('../components/admin/metric-trend-plot', () => ({
  default: (props: { dataKey: string; alto?: string }) =>
    createElement('div', { 'data-testid': `plot-${props.dataKey}`, 'data-alto': props.alto }),
}));
vi.mock('../lib/services/admin', () => ({ getAdminMetricas: vi.fn() }));

import DashboardRootLayout from '../app/dashboard/layout';
import AdminMetricasPage from '../app/dashboard/admin/metricas/page';
import { getAdminMetricas } from '../lib/services/admin';

const SERIE = [
  { inicio: '2026-09-28', usuariosNuevos: 3, usuariosActivos: 1, proyectosCreados: 1, tareasCompletadas: 2, horasConfirmadas: 4.5 },
  { inicio: '2026-10-05', usuariosNuevos: 2, usuariosActivos: 4, proyectosCreados: 0, tareasCompletadas: 4, horasConfirmadas: 5.5 },
];

function renderRuta() {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(DashboardRootLayout, null, createElement(AdminMetricasPage)),
    ),
  );
}

// La primera carga encadena dos módulos diferidos (la sección y su dibujo): se le da margen.
const primeraGrafica = () => screen.findByTestId('plot-usuariosNuevos', undefined, { timeout: 5000 });

const comoAdmin = () =>
  currentUserMock.mockReturnValue({ data: { idUsuario: 1, roles: ['administrador'] }, isLoading: false, isError: false });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('/dashboard/admin/metricas — acceso', () => {
  it('un estudiante es redirigido a /dashboard: no ve la página ni se consultan las métricas', async () => {
    currentUserMock.mockReturnValue({ data: { idUsuario: 2, roles: ['estudiante'] }, isLoading: false, isError: false });
    renderRuta();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Tendencias de uso' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell-estudiante')).not.toBeInTheDocument();
    expect(getAdminMetricas).not.toHaveBeenCalled();
  });

  it('sin sesión se redirige a /login', async () => {
    currentUserMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderRuta();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(getAdminMetricas).not.toHaveBeenCalled();
  });

  it('un administrador entra directo por la URL, dentro del shell administrativo', async () => {
    comoAdmin();
    vi.mocked(getAdminMetricas).mockResolvedValue({ periodo: 'semana', serie: SERIE });
    renderRuta();

    expect(await screen.findByRole('heading', { level: 1, name: 'Tendencias de uso' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación administrativa' })).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('/dashboard/admin/metricas — contenido', () => {
  it('muestra la miga de pan, el titular único y las cinco métricas en su variante amplia', async () => {
    comoAdmin();
    vi.mocked(getAdminMetricas).mockResolvedValue({ periodo: 'semana', serie: SERIE });
    renderRuta();

    await primeraGrafica();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('MétricasTendencias de uso');
    for (const serie of ['usuariosNuevos', 'usuariosActivos', 'proyectosCreados', 'tareasCompletadas', 'horasConfirmadas']) {
      expect(await screen.findByTestId(`plot-${serie}`)).toHaveAttribute('data-alto', 'amplio');
    }
  });

  it('hace una sola consulta, por semana, al servicio de métricas que ya existía', async () => {
    comoAdmin();
    vi.mocked(getAdminMetricas).mockResolvedValue({ periodo: 'semana', serie: SERIE });
    renderRuta();

    await primeraGrafica();
    expect(getAdminMetricas).toHaveBeenCalledTimes(1);
    expect(getAdminMetricas).toHaveBeenCalledWith('semana');
  });

  it('carga la sección con next/dynamic y sin SSR: recharts no entra en el JS inicial de la ruta', () => {
    const fuente = readFileSync(join(__dirname, '../app/dashboard/admin/metricas/page.tsx'), 'utf8');

    expect(fuente).toMatch(/dynamic\(\s*\(\) => import\('@\/components\/admin\/AdminMetricsSection'\)/);
    expect(fuente).toContain('ssr: false');
    expect(fuente).not.toMatch(/^import[^;]*from '@\/components\/admin\/AdminMetricsSection'/m);
    expect(fuente).not.toContain("from 'recharts'");
  });
});
