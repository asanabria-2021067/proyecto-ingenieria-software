import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * El panel del coordinador ES el panel del admin (misma página), con los datos de su alcance, otro título y sin
 * lo exclusivo de administración. Sus rutas /dashboard/coordinador/* son alias de las pantallas compartidas.
 */

const esCoordinadorMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/coordinador',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: redirectMock,
}));
vi.mock('../hooks/use-can', () => ({ useEsCoordinador: () => esCoordinadorMock() }));
vi.mock('../lib/services/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin')>();
  return { ...actual, getAdminStats: vi.fn(), getAdminMetricas: vi.fn() };
});
vi.mock('../lib/services/coordinador', () => ({ getMiAlcance: vi.fn() }));
vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn().mockRejectedValue(new Error('x')) }));
vi.mock('../components/admin/dashboard/estado-sistema', () => ({
  EstadoSistemaCard: () => <div data-testid="estado-sistema" />,
}));

import AdminPanelPage from '../app/dashboard/admin/page';
import CoordinadorPanelPage from '../app/dashboard/coordinador/page';
import CoordinadorPendientesPage from '../app/dashboard/coordinador/pendientes/page';
import AdminBandejaPage from '../app/dashboard/admin/bandeja/page';
import CoordinadorCierresPage from '../app/dashboard/coordinador/cierres/page';
import { getAdminMetricas, getAdminStats, type AdminStats } from '../lib/services/admin';
import { getMiAlcance } from '../lib/services/coordinador';

const STATS: AdminStats = {
  proyectosActivos: 4,
  usuariosActivos: 20,
  enRevision: 2,
  cierrePendiente: 1,
  usuariosBloqueados: 3,
  nuevosInactivos2026: 0,
  proyectosCerrados2026: 1,
  actividadReciente: [],
  estudiantesEnRiesgo: [
    { idUsuario: 9, nombre: 'Diego', apellido: 'Morales', semestre: 7, horasExtension: 12, horasExtensionRequeridas: 100 },
  ],
};

const ALCANCE = (carreras: string[]) => ({
  todas: false,
  carreras: carreras.map((nombreCarrera, i) => ({ idCarrera: i + 1, nombreCarrera, facultad: null })),
  regla: 'regla',
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPanelPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getAdminStats).mockResolvedValue(STATS);
  vi.mocked(getAdminMetricas).mockResolvedValue({ periodo: 'semana', serie: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('panel del coordinador (misma página que el del admin)', () => {
  it('lleva el título de coordinación y, de subtítulo, sus carreras', async () => {
    esCoordinadorMock.mockReturnValue(true);
    vi.mocked(getMiAlcance).mockResolvedValue(ALCANCE(['Ingeniería en Ciencias de la Computación y TI']));
    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Panel de Coordinación' })).toBeInTheDocument();
    expect(await screen.findByText('Ingeniería en Ciencias de la Computación y TI')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Panel de Administración' })).not.toBeInTheDocument();
  });

  it('sin carreras asignadas explica por qué las listas están vacías', async () => {
    esCoordinadorMock.mockReturnValue(true);
    vi.mocked(getMiAlcance).mockResolvedValue(ALCANCE([]));
    renderPanel();

    expect(await screen.findByText(/Aún no tienes carreras asignadas/)).toBeInTheDocument();
    expect(screen.getByText(/Pide a un administrador/)).toBeInTheDocument();
  });

  it('muestra las mismas tarjetas, pero sin lo exclusivo del admin: estado del sistema ni usuarios bloqueados', async () => {
    esCoordinadorMock.mockReturnValue(true);
    vi.mocked(getMiAlcance).mockResolvedValue(ALCANCE(['Civil']));
    renderPanel();

    expect(await screen.findByRole('group', { name: 'Proyectos Activos' })).toHaveTextContent('4');
    expect(screen.getByText('Requieren atención')).toBeInTheDocument();
    expect(screen.getByText('Estudiantes en riesgo de horas')).toBeInTheDocument();
    expect(screen.queryByTestId('estado-sistema')).not.toBeInTheDocument();
    expect(screen.queryByText('Bloqueados')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', '/dashboard/admin/horas');
  });

  it('el administrador conserva su título, su estado del sistema y los bloqueados', async () => {
    esCoordinadorMock.mockReturnValue(false);
    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Panel de Administración' })).toBeInTheDocument();
    expect(screen.getByTestId('estado-sistema')).toBeInTheDocument();
    const cola = screen.getByText('Requieren atención').closest('section') as HTMLElement;
    expect(within(cola).getByText('Bloqueados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', '/dashboard/admin/usuarios?riesgo=horas');
  });
});

describe('rutas /dashboard/coordinador/*: alias de las pantallas compartidas', () => {
  it('el panel y la bandeja de pendientes son los mismos componentes del admin', () => {
    expect(CoordinadorPanelPage).toBe(AdminPanelPage);
    expect(CoordinadorPendientesPage).toBe(AdminBandejaPage);
  });

  it('las solicitudes de cierre llevan a la bandeja de cierres del admin', () => {
    CoordinadorCierresPage();
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/admin/proyectos?grupo=cierres');
  });
});
