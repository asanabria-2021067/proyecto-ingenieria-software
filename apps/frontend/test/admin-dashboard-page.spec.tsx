import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/services/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin')>();
  return { ...actual, getAdminStats: vi.fn() };
});
vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn() }));

import AdminPanelPage from '../app/dashboard/admin/page';
import { getAdminStats, type AdminStats } from '../lib/services/admin';
import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import type { AdminSprintCalendar } from '../lib/types/admin-sprints';

const statsMock = vi.mocked(getAdminStats);
const calendarMock = vi.mocked(getAdminSprintCalendar);

const STATS: AdminStats = {
  proyectosActivos: 14,
  usuariosActivos: 30,
  enRevision: 7,
  cierrePendiente: 8,
  usuariosBloqueados: 3,
  nuevosInactivos2026: 5,
  proyectosCerrados2026: 4,
  actividadReciente: [
    { idProyecto: 36, tituloProyecto: 'Sistema de Tutorías Académicas', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_PROGRESO', fechaActualizacion: null },
    { idProyecto: 57, tituloProyecto: 'Laboratorio de reciclaje', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'EN_SOLICITUD_CIERRE', fechaActualizacion: null },
  ],
  estudiantesEnRiesgo: [
    { idUsuario: 9, nombre: 'Diego', apellido: 'Morales', semestre: 7, horasExtension: 12, horasExtensionRequeridas: 100 },
    { idUsuario: 10, nombre: 'Karla', apellido: 'Paz', semestre: null, horasExtension: 0, horasExtensionRequeridas: 100 },
  ],
};

const CALENDARIO: AdminSprintCalendar = {
  hoy: '2026-10-05',
  items: [
    {
      idSprint: 20,
      numero: 1,
      estado: 'ACTIVO',
      idProyecto: 2,
      tituloProyecto: 'App de Monitoreo Ambiental',
      lider: { idUsuario: 2, nombre: 'Test', apellido: 'Dos' },
      fechaInicio: '2026-03-31T19:50:21.725Z',
      fechaFinPlaneada: '2026-10-05',
      fechaFinalizacionIniciada: null,
      fechaCierre: null,
      situacion: 'VENCE_HOY',
      diasRestantes: 0,
      desviacionDias: null,
    },
  ],
  conteos: { EN_CURSO: 0, VENCE_HOY: 1, PLAN_VENCIDO: 0, EN_FINALIZACION: 0, SIN_FECHA: 0 },
  resumen: { proximos7Dias: 1, planVencido: 0 },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AdminPanelPage />, { wrapper });
}

/** Tarjeta KPI por su etiqueta accesible. */
function kpi(label: string): HTMLElement {
  return screen.getByRole('group', { name: label });
}

beforeEach(() => {
  statsMock.mockReset();
  calendarMock.mockReset();
  statsMock.mockResolvedValue(STATS);
  calendarMock.mockResolvedValue(CALENDARIO);
});

afterEach(cleanup);

describe('Panel de Administración (/dashboard/admin)', () => {
  it('conserva el encabezado del panel', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel de Administración' })).toBeInTheDocument();
    expect(screen.getByText('Resumen general de actividad, usuarios y proyectos en UVGenius.')).toBeInTheDocument();
  });

  it('ordena el panel en cinco secciones: Global, Operación, Seguimiento, Datos 2026 y Tendencias de uso', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual([
      'Global',
      'Operación',
      'Seguimiento',
      'Datos 2026',
      'Tendencias de uso',
    ]);
  });

  it('Global muestra proyectos y usuarios activos', async () => {
    renderPage();
    const global = await screen.findByRole('region', { name: 'Global' });

    expect(within(global).getAllByRole('group')).toHaveLength(2);
    expect(within(kpi('Proyectos Activos')).getByText('14')).toBeInTheDocument();
    expect(within(kpi('Proyectos Activos')).getByText('Actualmente publicados o en progreso')).toBeInTheDocument();
    expect(within(kpi('Usuarios Activos')).getByText('30')).toBeInTheDocument();
  });

  it('Operación tiene la cola de atención y el resumen de Sprints la sigue en su propia columna', async () => {
    renderPage();
    const operacion = await screen.findByRole('region', { name: 'Operación' });

    const cola = within(operacion).getByRole('region', { name: 'Requieren atención' });
    // El resumen de Sprints es una columna aparte (complementaria), no una celda de Operación…
    const columna = screen.getByRole('complementary', { name: 'Planificación de Sprints' });
    const sprints = within(columna).getByRole('region', { name: 'Próximas finalizaciones de Sprint' });
    expect(operacion).not.toContainElement(sprints);
    // …y en el documento va entre Operación y Seguimiento: ese es su orden en tablet y móvil.
    const seguimiento = screen.getByRole('region', { name: 'Seguimiento' });
    expect(cola.compareDocumentPosition(sprints) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sprints.compareDocumentPosition(seguimiento) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(cola).getByText('En revisión')).toBeInTheDocument();
    expect(within(cola).getByText('Cierre pendiente')).toBeInTheDocument();
    expect(within(cola).getByText('Bloqueados')).toBeInTheDocument();
    expect(within(cola).getByText('18 pendientes')).toBeInTheDocument();

    expect(await within(sprints).findByText('Octubre 2026')).toBeInTheDocument();
    expect(within(sprints).getByText('Próximos 7 días')).toBeInTheDocument();
    expect(within(sprints).getByRole('link', { name: /Ver proyecto/ })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/2',
    );
  });

  it('ya no existen las tres tarjetas grandes de «Requieren acción»', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByRole('heading', { name: 'Requieren acción' })).not.toBeInTheDocument();
  });

  it('Seguimiento conserva la actividad reciente con su estado y su enlace al proyecto', async () => {
    renderPage();
    const seguimiento = await screen.findByRole('region', { name: 'Seguimiento' });
    const actividad = within(seguimiento).getByRole('region', { name: 'Actividad reciente' });

    expect(within(actividad).getByText('Sistema de Tutorías Académicas')).toBeInTheDocument();
    expect(within(actividad).getByText('En progreso')).toBeInTheDocument();
    expect(within(actividad).getByText('En solicitud de cierre')).toBeInTheDocument();
    const enlaces = within(actividad).getAllByRole('link', { name: 'Ver proyecto' });
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/dashboard/admin/proyectos/36',
      '/dashboard/admin/proyectos/57',
    ]);
  });

  it('Seguimiento conserva los estudiantes en riesgo: nombre, semestre, horas y «Ver todos»', async () => {
    renderPage();
    const seguimiento = await screen.findByRole('region', { name: 'Seguimiento' });
    const riesgo = within(seguimiento).getByRole('region', { name: 'Estudiantes en riesgo de horas' });

    expect(within(riesgo).getByText('Diego Morales')).toBeInTheDocument();
    expect(within(riesgo).getByText('S7')).toBeInTheDocument();
    expect(within(riesgo).getByText('12 / 100 hrs')).toBeInTheDocument();
    expect(within(riesgo).getByText('Karla Paz')).toBeInTheDocument();
    expect(within(riesgo).getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/dashboard/admin/usuarios?riesgo=horas',
    );
  });

  it('las listas vacías de Seguimiento muestran su mensaje', async () => {
    statsMock.mockResolvedValue({ ...STATS, actividadReciente: [], estudiantesEnRiesgo: [] });
    renderPage();

    expect(await screen.findByText('No hay actividad reciente')).toBeInTheDocument();
    expect(screen.getByText('No hay estudiantes en riesgo')).toBeInTheDocument();
  });

  it('Datos 2026 queda al final con inactivos y proyectos cerrados', async () => {
    renderPage();
    const datos = await screen.findByRole('region', { name: 'Datos 2026' });

    expect(within(datos).getAllByRole('group')).toHaveLength(2);
    expect(within(kpi('Nuevos Inactivos')).getByText('5')).toBeInTheDocument();
    expect(within(kpi('Proyectos Cerrados')).getByText('4')).toBeInTheDocument();
  });

  it('si falla solo el calendario de Sprints, el resto del panel sigue disponible', async () => {
    calendarMock.mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByText('No se pudo cargar la planificación de Sprints.')).toBeInTheDocument();
    expect(within(kpi('Proyectos Activos')).getByText('14')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Requieren atención' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Actividad reciente' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Datos 2026' })).toBeInTheDocument();
  });

  it('mientras cargan las estadísticas muestra el esqueleto del panel', () => {
    statsMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Cargando el panel de administración' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('si fallan las estadísticas avisa y no intenta pintar el panel', async () => {
    statsMock.mockRejectedValue(new Error('500'));
    renderPage();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('No se pudieron cargar las estadísticas administrativas.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Global' })).not.toBeInTheDocument();
  });

  it('hace una sola petición a estadísticas y una sola al calendario de Sprints', async () => {
    renderPage();
    const sprints = await screen.findByRole('region', { name: 'Próximas finalizaciones de Sprint' });
    await within(sprints).findByText('Octubre 2026');

    expect(statsMock).toHaveBeenCalledTimes(1);
    expect(calendarMock).toHaveBeenCalledTimes(1);
  });
});
