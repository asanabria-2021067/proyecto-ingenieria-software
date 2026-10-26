import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn() }));
vi.mock('../lib/services/admin-meetings', () => ({
  getAdminMeetingsInRange: vi.fn(),
  getAllAdminMeetings: vi.fn(),
  getAdminMeetingParticipants: vi.fn(),
  getEligibleMeetingProjects: vi.fn().mockResolvedValue([]),
  getMeetingProjectTeam: vi.fn(),
  getAdminMeeting: vi.fn(),
  createAdminMeeting: vi.fn(),
  updateAdminMeeting: vi.fn(),
  cancelAdminMeeting: vi.fn(),
}));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 8, nombre: 'Ana', apellido: 'Pérez' } }) }));

import AdminSprintsClient from '../app/dashboard/admin/sprints/admin-sprints-client';
import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import { getAdminMeetingParticipants, getAdminMeetingsInRange, getAllAdminMeetings } from '../lib/services/admin-meetings';
import type { AdminMeeting } from '../lib/types/admin-meetings';
import type { AdminSprintCalendar, AdminSprintCalendarItem } from '../lib/types/admin-sprints';

const getCalendarMock = vi.mocked(getAdminSprintCalendar);
const getRangeMock = vi.mocked(getAdminMeetingsInRange);
const getUpcomingMock = vi.mocked(getAllAdminMeetings);
const getParticipantsMock = vi.mocked(getAdminMeetingParticipants);

function sprint(overrides: Partial<AdminSprintCalendarItem> & { idSprint: number }): AdminSprintCalendarItem {
  return {
    numero: 1,
    estado: 'ACTIVO',
    idProyecto: overrides.idSprint,
    tituloProyecto: `Proyecto ${overrides.idSprint}`,
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    fechaInicio: '2026-07-24T15:00:00.000Z',
    fechaFinPlaneada: '2026-10-12',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    situacion: 'EN_CURSO',
    diasRestantes: 6,
    desviacionDias: null,
    ...overrides,
  };
}

/** Tal como lo clasifica el backend el 6 de octubre de 2026 (día de Guatemala). */
function calendario(items?: AdminSprintCalendarItem[]): AdminSprintCalendar {
  return {
    hoy: '2026-10-06',
    items: items ?? [
      sprint({ idSprint: 1, tituloProyecto: 'Portal de Voluntariado', fechaFinPlaneada: '2026-10-12', diasRestantes: 6 }),
      sprint({ idSprint: 2, tituloProyecto: 'Tutorías — Sprint 6 Demo', numero: 3, fechaFinPlaneada: '2026-10-08', diasRestantes: 2 }),
      sprint({ idSprint: 3, tituloProyecto: 'Huerto Comunitario', lider: { idUsuario: 2, nombre: 'Vernel', apellido: 'Hernández' }, fechaFinPlaneada: '2026-10-08', diasRestantes: 2 }),
      sprint({ idSprint: 4, tituloProyecto: 'Plataforma de Tutorías', fechaFinPlaneada: '2026-10-04', situacion: 'PLAN_VENCIDO', diasRestantes: -2 }),
      sprint({ idSprint: 5, tituloProyecto: 'App de Monitoreo', fechaFinPlaneada: '2026-10-06', situacion: 'VENCE_HOY', diasRestantes: 0 }),
      sprint({ idSprint: 6, tituloProyecto: 'Feria tecnológica', estado: 'EN_FINALIZACION', fechaFinPlaneada: '2026-09-06', situacion: 'EN_FINALIZACION', diasRestantes: -30 }),
      sprint({ idSprint: 7, tituloProyecto: 'Biblioteca Digital', fechaFinPlaneada: null, situacion: 'SIN_FECHA', diasRestantes: null }),
    ],
    conteos: { EN_CURSO: 3, VENCE_HOY: 1, PLAN_VENCIDO: 1, EN_FINALIZACION: 1, SIN_FECHA: 1 },
    resumen: { proximos7Dias: 4, planVencido: 1 },
  };
}

function renderPage(vista?: 'dia' | 'semana' | 'mes' | 'lista', fecha?: string) {
  const params = new URLSearchParams(vista ? `vista=${vista}` : '');
  if (fecha !== undefined) params.set('fecha', fecha);
  searchParamsMock.mockReturnValue(params);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return render(createElement(AdminSprintsClient), { wrapper });
}

const dia = (nombre: RegExp) => screen.getByRole('button', { name: nombre });
const detalle = () => screen.getByRole('region', { name: /de 2026$/ });

function filasDeLaLista(): string[] {
  return within(screen.getAllByRole('table')[0])
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[0].querySelector('p')?.textContent ?? '');
}

function elegirSituacion(opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por situación temporal' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

beforeEach(() => {
  getCalendarMock.mockReset();
  getCalendarMock.mockResolvedValue(calendario());
  getRangeMock.mockReset();
  getRangeMock.mockResolvedValue({ reuniones: [], completo: true });
  getUpcomingMock.mockReset();
  getUpcomingMock.mockResolvedValue({ reuniones: [], completo: true });
  getParticipantsMock.mockReset();
  getParticipantsMock.mockResolvedValue({ idReunion: 0, totalDestinatariosUnicos: 0 });
});

afterEach(cleanup);

describe('Calendario de Sprints — encabezado y vistas', () => {
  it('sin ?vista abre en Mes y el selector enlaza a ambas vistas', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Calendario de Sprints' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
    const selector = within(screen.getByRole('navigation', { name: 'Vista del calendario' }));
    expect(selector.getByRole('link', { name: 'Mes' })).toHaveAttribute('aria-current', 'page');
    expect(selector.getByRole('link', { name: 'Mes' })).toHaveAttribute('href', '/dashboard/admin/sprints?vista=mes');
    expect(selector.getByRole('link', { name: 'Lista' })).toHaveAttribute('href', '/dashboard/admin/sprints?vista=lista');
    expect(selector.getByRole('link', { name: 'Lista' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('?vista=lista muestra la tabla y un valor desconocido cae en Mes', async () => {
    const { unmount } = renderPage('lista');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Octubre 2026' })).not.toBeInTheDocument();
    unmount();

    searchParamsMock.mockReturnValue(new URLSearchParams('vista=anual'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(QueryClientProvider, { client }, createElement(AdminSprintsClient)));
    expect(await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
  });

  it('no ofrece ninguna acción operativa sobre los Sprints ni enlaza al workspace del líder', async () => {
    renderPage('lista');
    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: /finalizar|cerrar|editar|replanificar|nuevo evento/i })).not.toBeInTheDocument();
    const destinos = screen.getAllByRole('link').map((l) => l.getAttribute('href') ?? '');
    expect(destinos.some((h) => h.includes('/sprints/') || h.startsWith('/dashboard/proyectos/'))).toBe(false);
    expect(screen.getByRole('link', { name: 'Ver proyecto Huerto Comunitario' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/3',
    );
  });
});

describe('Calendario de Sprints — vista Mes', () => {
  it('marca cada día con su número de finalizaciones y usa el «hoy» del servidor', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    expect(dia(/^8 de octubre de 2026, 2 finalizaciones planificadas$/)).toHaveTextContent('2 Sprints');
    expect(dia(/^12 de octubre de 2026, 1 finalización planificada$/)).toBeInTheDocument();
    expect(dia(/^4 de octubre de 2026, 1 finalización planificada, con plan vencido$/)).toBeInTheDocument();
    expect(dia(/^9 de octubre de 2026, sin finalizaciones planificadas$/)).toBeInTheDocument();
    // Hoy es el día del backend, y entra seleccionado aunque no sea el que más datos tiene.
    const hoy = dia(/^6 de octubre de 2026, hoy, 1 finalización planificada$/);
    expect(hoy).toHaveAttribute('aria-current', 'date');
    expect(hoy).toHaveAttribute('aria-pressed', 'true');
    expect(within(detalle()).getByText('App de Monitoreo')).toBeInTheDocument();
  });

  it('seleccionar un día lista todas sus finalizaciones con Sprint, situación, líder y enlace administrativo', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(dia(/^8 de octubre de 2026,/));
    const panel = within(detalle());
    expect(panel.getByRole('heading', { level: 2, name: '8 de octubre de 2026' })).toBeInTheDocument();
    expect(panel.getByText('2 finalizaciones planificadas')).toBeInTheDocument();
    const filas = panel.getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText('Tutorías — Sprint 6 Demo')).toBeInTheDocument();
    expect(within(filas[0]).getByText('Sprint 3')).toBeInTheDocument();
    expect(within(filas[0]).getByText('En curso')).toBeInTheDocument();
    expect(within(filas[0]).getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(within(filas[0]).getByText(/8 oct 2026/)).toBeInTheDocument();
    expect(within(filas[1]).getByRole('link', { name: 'Ver proyecto Huerto Comunitario' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/3',
    );
    expect(dia(/^6 de octubre de 2026, hoy/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('separa la fecha de los Sprints: una tarjeta con el día y el conteo, y una tarjeta por Sprint', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });
    fireEvent.click(dia(/^8 de octubre de 2026,/));

    const panel = within(detalle());
    const lista = panel.getByRole('list', { name: 'Actividades del 8 de octubre de 2026' });
    const tarjetas = within(lista).getAllByRole('listitem');
    expect(tarjetas).toHaveLength(2);
    for (const tarjeta of tarjetas) expect(tarjeta).toHaveClass('card-base');
    // La fecha y el conteo viven en su propia tarjeta, fuera de la lista.
    const fecha = panel.getByRole('heading', { level: 2, name: '8 de octubre de 2026' });
    expect(lista).not.toContainElement(fecha);
    expect(lista).not.toHaveTextContent('2 finalizaciones planificadas');
    expect(fecha.closest('.card-base')).toHaveTextContent('2 finalizaciones planificadas');
    // Sin desbordamiento no hay flechas de carrusel.
    expect(panel.queryByRole('button', { name: /^Actividades (anteriores|siguientes)$/ })).not.toBeInTheDocument();
  });

  it('un día sin finalizaciones lo dice en su propia tarjeta de vacío, aparte de la fecha', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(dia(/^9 de octubre de 2026,/));
    // Con la consulta de reuniones resuelta (vacía), el vacío ya puede decir que tampoco hay reuniones.
    const mensaje = await within(detalle()).findByText('No hay finalizaciones ni reuniones para este día.');
    // mismo vacío que el calendario del estudiante: tarjeta Empty con icono, no un texto bajo la fecha
    const vacio = mensaje.closest('[data-slot="empty"]') as HTMLElement;
    expect(vacio).not.toBeNull();
    expect(vacio.querySelector('[data-slot="empty-icon"]')).toHaveAttribute('data-variant', 'icon');
    expect(vacio).not.toContainElement(screen.getByRole('heading', { level: 2, name: /9 de octubre de 2026/ }));
    expect(within(detalle()).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('navega entre meses sin pedir nada más; un plan vencido de septiembre sigue en septiembre', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Septiembre 2026' })).toBeInTheDocument();
    expect(dia(/^6 de septiembre de 2026, 1 finalización planificada$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Noviembre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Sin finalizaciones planificadas este mes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
    expect(dia(/^6 de octubre de 2026, hoy/)).toHaveAttribute('aria-pressed', 'true');
    expect(getCalendarMock).toHaveBeenCalledTimes(1);
  });

  it('avisa de los Sprints sin fecha, que no caen en ningún día, y lleva a la Lista filtrada', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    const aviso = screen.getByRole('link', { name: /1 Sprint sin fecha planificada/ });
    expect(aviso).toHaveAttribute('href', '/dashboard/admin/sprints?vista=lista');
    fireEvent.click(aviso);
    expect(screen.getByRole('combobox', { name: 'Filtrar por situación temporal' })).toHaveTextContent('Sin fecha');
  });
});

describe('Calendario de Sprints — vista Lista', () => {
  it('ordena por prioridad de supervisión y muestra las siete columnas', async () => {
    renderPage('lista');
    const tabla = within(await screen.findByRole('table'));

    expect(tabla.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Proyecto',
      'Sprint',
      'Líder',
      'Inicio',
      'Finalización esperada',
      'Situación',
      'Acción',
    ]);
    expect(filasDeLaLista()).toEqual([
      'Plataforma de Tutorías',
      'App de Monitoreo',
      'Tutorías — Sprint 6 Demo',
      'Huerto Comunitario',
      'Portal de Voluntariado',
      'Feria tecnológica',
      'Biblioteca Digital',
    ]);
    const filas = tabla.getAllByRole('row').slice(1);
    expect(within(filas[0]).getByText('Plan vencido')).toBeInTheDocument();
    expect(within(filas[0]).getByText('Hace 2 días')).toBeInTheDocument();
    expect(within(filas[1]).getByText('Vence hoy')).toBeInTheDocument();
    expect(within(filas[2]).getByText('24 jul 2026')).toBeInTheDocument();
    expect(within(filas[5]).getByText('En finalización')).toBeInTheDocument();
    expect(within(filas[6]).getAllByText('Sin fecha').length).toBeGreaterThan(0);
  });
});

describe('Calendario de Sprints — búsqueda y filtros', () => {
  it('busca por proyecto o líder, filtra por situación, combina y limpia', async () => {
    renderPage('lista');
    await screen.findByRole('table');
    // Que termine la carga de reuniones (su esqueleto también es un `status`).
    await screen.findByText('No hay reuniones administrativas próximas.');
    const buscador = screen.getByRole('textbox', { name: 'Buscar Sprints por proyecto o líder' });
    expect(screen.getByRole('status')).toHaveTextContent('7 Sprints operables');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: '  tutorias ' } });
    expect(filasDeLaLista()).toEqual(['Plataforma de Tutorías', 'Tutorías — Sprint 6 Demo']);
    expect(screen.getByRole('status')).toHaveTextContent('2 de 7 Sprints');

    elegirSituacion('Plan vencido');
    expect(filasDeLaLista()).toEqual(['Plataforma de Tutorías']);

    fireEvent.change(buscador, { target: { value: 'hernandez' } });
    expect(screen.getByText('No se encontraron Sprints con estos filtros.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);
    expect(filasDeLaLista()).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('los mismos filtros afectan a las marcas del Mes', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Sprints por proyecto o líder' }), {
      target: { value: 'huerto' },
    });
    expect(dia(/^8 de octubre de 2026, 1 finalización planificada$/)).toBeInTheDocument();
    expect(dia(/^12 de octubre de 2026, sin finalizaciones planificadas$/)).toBeInTheDocument();
    expect(screen.getByText('1 finalización planificada este mes')).toBeInTheDocument();
  });
});

describe('Calendario de Sprints — carga, vacío y error', () => {
  it('mientras carga muestra el esqueleto de la vista activa', () => {
    getCalendarMock.mockReturnValue(new Promise(() => {}));
    renderPage('lista');
    expect(screen.getByRole('status', { name: 'Cargando el calendario de Sprints' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sin Sprints operables la Lista lo explica sin tabla de Sprints y el Mes sigue disponible para las reuniones', async () => {
    getCalendarMock.mockResolvedValue(calendario([]));
    const { unmount } = renderPage('lista');
    expect(await screen.findByText('No hay Sprints operables para supervisar.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();

    renderPage('mes');
    expect(await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
    expect(screen.getByText('Sin finalizaciones planificadas este mes')).toBeInTheDocument();
  });

  it('si el endpoint falla avisa sin detalles técnicos y permite reintentar', async () => {
    getCalendarMock.mockRejectedValue(new Error('ECONNREFUSED 500 stack'));
    renderPage('mes');

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('No se pudo cargar el calendario de Sprints.')).toBeInTheDocument();
    expect(alerta).not.toHaveTextContent(/ECONNREFUSED|stack/);
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(getCalendarMock).toHaveBeenCalledTimes(2);
  });

  it('toda la página sale de una sola petición, sin consultas por proyecto ni por día', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });
    fireEvent.click(dia(/^8 de octubre de 2026,/));
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(getCalendarMock).toHaveBeenCalledTimes(1);
  });
});

describe('Calendario de Sprints — día en la URL (?fecha=)', () => {
  it('?fecha= abre su mes, selecciona ese día y muestra sus finalizaciones sin tocar «hoy»', async () => {
    renderPage('mes', '2026-09-06');
    await screen.findByRole('heading', { level: 2, name: 'Septiembre 2026' });

    expect(dia(/^6 de septiembre de 2026,/)).toHaveAttribute('aria-pressed', 'true');
    const panel = within(detalle());
    expect(panel.getByRole('heading', { level: 2, name: '6 de septiembre de 2026' })).toBeInTheDocument();
    expect(panel.getByText('Feria tecnológica')).toBeInTheDocument();
  });

  it('una fecha sin Sprints lo dice en el panel', async () => {
    renderPage('mes', '2026-11-20');
    await screen.findByRole('heading', { level: 2, name: 'Noviembre 2026' });

    expect(await within(detalle()).findByText('No hay finalizaciones ni reuniones para este día.')).toBeInTheDocument();
  });

  it.each(['2026-02-30', '2026-13-01', 'hoy', '2026-1-5', ''])('fecha inválida «%s» cae en el hoy del servidor', async (fecha) => {
    renderPage('mes', fecha);
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    expect(dia(/^6 de octubre de 2026, hoy/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(detalle()).getByRole('heading', { level: 2, name: '6 de octubre de 2026' })).toBeInTheDocument();
  });

  it('elegir otro día actualiza la selección y reescribe ?fecha= sin navegar', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(dia(/^8 de octubre de 2026,/));
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/dashboard/admin/sprints?vista=mes&fecha=2026-10-08');
    expect(dia(/^8 de octubre de 2026,/)).toHaveAttribute('aria-pressed', 'true');
    // Hoy conserva su marca propia aunque ya no sea el día seleccionado.
    expect(dia(/^6 de octubre de 2026, hoy/)).toHaveAttribute('aria-current', 'date');
    replaceState.mockRestore();
  });

  it('«Hoy» vuelve al mes y al día actuales del servidor y actualiza la URL', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage('mes', '2026-09-06');
    await screen.findByRole('heading', { level: 2, name: 'Septiembre 2026' });

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
    expect(dia(/^6 de octubre de 2026, hoy/)).toHaveAttribute('aria-pressed', 'true');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/dashboard/admin/sprints?vista=mes&fecha=2026-10-06');
    replaceState.mockRestore();
  });

  it('elegir un día del mes vecino lleva el calendario a ese mes', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(dia(/^1 de noviembre de 2026,/));
    expect(screen.getByRole('heading', { level: 2, name: 'Noviembre 2026' })).toBeInTheDocument();
  });

  it('el selector de vista conserva el día elegido', async () => {
    renderPage('mes', '2026-10-08');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute(
      'href',
      '/dashboard/admin/sprints?vista=lista&fecha=2026-10-08',
    );
  });
});

// ─── Reuniones de Administración y vistas Día / Semana ───────────────────────

/** Instante ISO de una hora LOCAL de octubre de 2026 (independiente del huso de la máquina). */
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

function reunion(idReunion: number, overrides: Partial<AdminMeeting> = {}): AdminMeeting {
  return {
    idReunion,
    estado: 'ACTIVA',
    integridad: 'OK',
    contenido: {
      tituloEvento: 'Seguimiento de cierre',
      descripcionEvento: null,
      fechaInicio: local(8, 9),
      fechaFin: local(8, 10, 30),
      modalidad: 'PRESENCIAL',
      ubicacionNombre: 'Edificio CIT, salón 210',
    },
    proyectos: [
      { idProyecto: 3, idEvento: 31, tituloProyecto: 'Huerto Comunitario', estadoProyecto: 'EN_PROGRESO' },
      { idProyecto: 1, idEvento: 11, tituloProyecto: 'Portal de Voluntariado', estadoProyecto: 'EN_PROGRESO' },
    ],
    creador: { idUsuario: 9, nombre: 'Ana', apellido: 'López' },
    ...overrides,
  };
}

const REUNIONES: AdminMeeting[] = [
  reunion(1),
  reunion(2, {
    contenido: { ...reunion(2).contenido!, tituloEvento: 'Revisión de avance', fechaInicio: local(6, 15), fechaFin: local(6, 16), modalidad: 'VIRTUAL', ubicacionNombre: null },
    proyectos: [{ idProyecto: 5, idEvento: 51, tituloProyecto: 'App de Monitoreo', estadoProyecto: 'EN_PROGRESO' }],
  }),
  reunion(3, { estado: 'CANCELADA', contenido: { ...reunion(3).contenido!, tituloEvento: 'Reunión cancelada' } }),
  reunion(4, { integridad: 'INCONSISTENTE', contenido: null }),
];

describe('Calendario administrativo — reuniones en el Mes', () => {
  beforeEach(() => {
    getRangeMock.mockResolvedValue({ reuniones: REUNIONES, completo: true });
    getParticipantsMock.mockImplementation(async (id) => ({ idReunion: id, totalDestinatariosUnicos: id === 1 ? 7 : 1 }));
  });

  it('pide las reuniones del rango visible del Mes y las cuenta aparte de las finalizaciones', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    expect(await screen.findByText('2 reuniones administrativas')).toBeInTheDocument();
    // La métrica principal no cambia: solo finalizaciones de Sprints del mes.
    expect(screen.getByText('5 finalizaciones planificadas este mes')).toBeInTheDocument();
    const [desde, hasta] = getRangeMock.mock.calls[0];
    expect(desde).toEqual(new Date(2026, 8, 28));
    expect(hasta).toEqual(new Date(2026, 10, 9));
    expect(dia(/^8 de octubre de 2026, 2 finalizaciones planificadas, 1 reunión administrativa$/)).toHaveTextContent('1 reunión');
  });

  it('excluye canceladas, avisa de las inconsistentes y muestra la reunión completa en el panel del día', async () => {
    renderPage('mes', '2026-10-08');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });
    const panel = within(detalle());
    const tarjeta = (await panel.findByText('Seguimiento de cierre')).closest('li') as HTMLElement;

    expect(screen.queryByText('Reunión cancelada')).not.toBeInTheDocument();
    expect(screen.getByText('1 reunión no se muestra porque sus datos no son consistentes.')).toBeInTheDocument();
    expect(panel.getByText('2 finalizaciones planificadas')).toBeInTheDocument();
    expect(panel.getByText('1 reunión administrativa')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Reunión administrativa')).toBeInTheDocument();
    expect(within(tarjeta).getByText('8 oct 2026')).toBeInTheDocument();
    expect(within(tarjeta).getByText('09:00 – 10:30')).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Presencial/)).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Edificio CIT, salón 210/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('2 equipos')).toBeInTheDocument();
    expect(await within(tarjeta).findByText('7 personas')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Ana López')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Ver proyecto Portal de Voluntariado' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/1',
    );
    // Las finalizaciones del día siguen con su tarjeta de siempre, antes que la reunión.
    const tarjetas = within(panel.getByRole('list', { name: 'Actividades del 8 de octubre de 2026' })).getAllByRole('listitem');
    expect(tarjetas[0]).toHaveTextContent('Tutorías — Sprint 6 Demo');
  });

  it('la búsqueda alcanza a los proyectos de una reunión multiproyecto; el filtro de situación no oculta reuniones', async () => {
    renderPage('mes', '2026-10-08');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });
    await within(detalle()).findByText('Seguimiento de cierre');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Sprints por proyecto o líder' }), { target: { value: 'voluntariado' } });
    expect(within(detalle()).getByText('Seguimiento de cierre')).toBeInTheDocument();
    expect(dia(/^6 de octubre de 2026, hoy, sin finalizaciones planificadas$/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Sprints por proyecto o líder' }), { target: { value: '' } });
    elegirSituacion('Plan vencido');
    expect(within(detalle()).getByText('Seguimiento de cierre')).toBeInTheDocument();
    expect(dia(/^8 de octubre de 2026, sin finalizaciones planificadas, 1 reunión administrativa$/)).toBeInTheDocument();
  });

  it('si fallan las reuniones lo avisa y los Sprints siguen visibles', async () => {
    getRangeMock.mockRejectedValue(new Error('500'));
    renderPage('mes', '2026-10-08');

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudieron cargar las reuniones administrativas.');
    expect(within(detalle()).getByText('Huerto Comunitario')).toBeInTheDocument();
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(getRangeMock).toHaveBeenCalledTimes(2);
  });
});

describe('Calendario administrativo — vistas Día y Semana', () => {
  beforeEach(() => {
    getRangeMock.mockResolvedValue({ reuniones: REUNIONES, completo: true });
  });

  it('el selector ofrece Día, Semana, Mes y Lista y cada enlace conserva el día', async () => {
    renderPage('semana', '2026-10-08');
    await screen.findByRole('heading', { level: 2, name: /5 oct/ });
    const selector = within(screen.getByRole('navigation', { name: 'Vista del calendario' }));
    expect(selector.getAllByRole('link').map((l) => l.textContent)).toEqual(['Día', 'Semana', 'Mes', 'Lista']);
    expect(selector.getByRole('link', { name: 'Semana' })).toHaveAttribute('aria-current', 'page');
    expect(selector.getByRole('link', { name: 'Día' })).toHaveAttribute('href', '/dashboard/admin/sprints?vista=dia&fecha=2026-10-08');
  });

  it('Semana pide su rango, pone las reuniones a su hora y las finalizaciones en «Todo el día»', async () => {
    renderPage('semana', '2026-10-08');
    const bloque = await screen.findByRole('button', { name: 'Seguimiento de cierre, 09:00 a 10:30' });

    const [desde, hasta] = getRangeMock.mock.calls[0];
    expect(desde).toEqual(new Date(2026, 9, 5));
    expect(hasta).toEqual(new Date(2026, 9, 12));
    expect(screen.getByText('Todo el día')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalización planificada: Huerto Comunitario, Sprint 1, En curso' })).toBeInTheDocument();
    // Semana del 5 al 11: dos el 8 y una el 6 (la del 4 y la del 12 quedan fuera).
    expect(screen.getByText('3 finalizaciones planificadas esta semana')).toBeInTheDocument();

    // Elegir la reunión la resalta en el panel del día.
    fireEvent.click(bloque);
    const tarjeta = within(detalle()).getByText('Seguimiento de cierre').closest('li') as HTMLElement;
    expect(tarjeta).toHaveAttribute('aria-current', 'true');
  });

  it('elegir una finalización en la franja lleva el panel a su día y resalta su tarjeta', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage('semana', '2026-10-06');
    await screen.findByRole('button', { name: 'Seguimiento de cierre, 09:00 a 10:30' });

    fireEvent.click(screen.getByRole('button', { name: /^Finalización planificada: Huerto Comunitario/ }));
    const panel = within(detalle());
    expect(panel.getByRole('heading', { level: 2, name: '8 de octubre de 2026' })).toBeInTheDocument();
    expect(panel.getByText('Huerto Comunitario', { selector: 'p' }).closest('li')).toHaveAttribute('aria-current', 'true');
    expect(panel.getByText('Tutorías — Sprint 6 Demo').closest('li')).not.toHaveAttribute('aria-current');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/dashboard/admin/sprints?vista=semana&fecha=2026-10-08');
    replaceState.mockRestore();
  });

  it('Día navega de día en día, actualiza el panel y «Hoy» vuelve al día del servidor', async () => {
    renderPage('dia', '2026-10-07');
    await screen.findByRole('heading', { level: 2, name: /, 7 de octubre de 2026$/i });

    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(screen.getByRole('heading', { level: 2, name: /, 8 de octubre de 2026$/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Seguimiento de cierre, 09:00 a 10:30' })).toBeInTheDocument();
    expect(within(detalle()).getByRole('heading', { level: 2, name: '8 de octubre de 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(within(detalle()).getByRole('heading', { level: 2, name: '6 de octubre de 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Revisión de avance, 15:00 a 16:00' })).toBeInTheDocument();
  });

  it('Semana navega de siete en siete días', async () => {
    renderPage('semana', '2026-10-08');
    await screen.findByRole('heading', { level: 2, name: /5 oct/ });
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    expect(screen.getByRole('heading', { level: 2, name: /12 oct/ })).toBeInTheDocument();
    expect(within(detalle()).getByRole('heading', { level: 2, name: '15 de octubre de 2026' })).toBeInTheDocument();
  });
});

describe('Calendario administrativo — Lista y solo consulta', () => {
  it('la Lista conserva la tabla de Sprints y añade la agenda activa de reuniones', async () => {
    getUpcomingMock.mockResolvedValue({ reuniones: REUNIONES, completo: true });
    renderPage('lista');

    const seccion = within((await screen.findByRole('heading', { level: 2, name: 'Reuniones administrativas próximas' })).closest('section') as HTMLElement);
    expect(await seccion.findByText('Seguimiento de cierre')).toBeInTheDocument();
    expect(seccion.getByText('Revisión de avance')).toBeInTheDocument();
    expect(seccion.queryByText('Reunión cancelada')).not.toBeInTheDocument();
    expect(getUpcomingMock).toHaveBeenCalledWith('activas');
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(filasDeLaLista()[0]).toBe('Plataforma de Tutorías');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Sprints por proyecto o líder' }), { target: { value: 'monitoreo' } });
    expect(seccion.queryByText('Seguimiento de cierre')).not.toBeInTheDocument();
    expect(seccion.getByText('Revisión de avance')).toBeInTheDocument();
  });

  // T-363: programar es la única acción general; editar y cancelar dependen del permiso de cada reunión
  // (`canManage`), que estas reuniones no traen. Nada se abre hasta que el administrador lo pide.
  it.each(['dia', 'semana', 'mes', 'lista'] as const)('%s: sin permiso de gestión ninguna reunión ofrece editar ni cancelar', async (vista) => {
    getRangeMock.mockResolvedValue({ reuniones: REUNIONES, completo: true });
    getUpcomingMock.mockResolvedValue({ reuniones: REUNIONES, completo: true });
    renderPage(vista, '2026-10-08');
    await screen.findAllByText('Seguimiento de cierre');

    const gestion = /editar|cancelar|reprogramar/i;
    expect(screen.queryAllByRole('button', { name: gestion })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: gestion })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Programar reunión' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

// ─── Barra de navegación (misma distribución que el calendario del estudiante) ───

describe('Calendario administrativo — barra de navegación', () => {
  /** Contenedor que agrupa el selector de vistas con Hoy, las flechas y el periodo. */
  const barra = () => screen.getByRole('navigation', { name: 'Vista del calendario' }).parentElement!;

  it('pone el selector a la izquierda y Hoy, flechas y periodo a la derecha, en la misma barra', async () => {
    renderPage('mes');
    const periodo = await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    const enBarra = within(barra());
    const selector = screen.getByRole('navigation', { name: 'Vista del calendario' });
    const hoy = enBarra.getByRole('button', { name: 'Hoy' });
    const anterior = enBarra.getByRole('button', { name: 'Mes anterior' });
    const siguiente = enBarra.getByRole('button', { name: 'Mes siguiente' });
    expect(barra()).toContainElement(periodo);
    // Orden: [vistas] … [Hoy] [‹] [›] periodo.
    const orden = [selector, hoy, anterior, siguiente, periodo];
    for (let i = 1; i < orden.length; i += 1) {
      expect(orden[i - 1].compareDocumentPosition(orden[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('la leyenda y el contador quedan fuera de la barra y del encabezado', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    expect(within(barra()).queryByText('Con plan vencido')).not.toBeInTheDocument();
    expect(within(barra()).queryByText(/Sprints operables/)).not.toBeInTheDocument();
    expect(screen.getByText('Con plan vencido')).toBeInTheDocument();
    expect(screen.getByText(/Sprints operables/)).toBeInTheDocument();
    const encabezado = screen.getByRole('heading', { level: 1, name: 'Calendario de Sprints' }).closest('header')!;
    expect(encabezado).not.toContainElement(screen.getByRole('navigation', { name: 'Vista del calendario' }));
    expect(within(encabezado).queryByText('Con plan vencido')).not.toBeInTheDocument();
  });

  it('el selector es un control segmentado: solo la vista activa lleva el fondo elevado', async () => {
    renderPage('semana', '2026-10-08');
    await screen.findByRole('button', { name: 'Hoy' });

    const selector = within(screen.getByRole('navigation', { name: 'Vista del calendario' }));
    const activa = selector.getByRole('link', { name: 'Semana' });
    expect(activa).toHaveAttribute('aria-current', 'page');
    expect(activa).toHaveClass('bg-surface-container-lowest', 'rounded-pill');
    for (const nombre of ['Día', 'Mes', 'Lista']) {
      expect(selector.getByRole('link', { name: nombre }), nombre).not.toHaveClass('bg-surface-container-lowest');
    }
    // Hoy es un botón del sistema, no un enlace de texto.
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('data-slot', 'button');
  });

  it('en Lista solo queda el selector, sin Hoy ni flechas', async () => {
    renderPage('lista');
    await screen.findByRole('table');

    expect(screen.getByRole('navigation', { name: 'Vista del calendario' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anterior$/ })).not.toBeInTheDocument();
  });

  it('mientras carga o si falla, el selector sigue disponible para cambiar de vista', async () => {
    getCalendarMock.mockReset();
    getCalendarMock.mockRejectedValue(new Error('caído'));
    renderPage('mes');

    expect(await screen.findByText('No se pudo cargar el calendario de Sprints.')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Vista del calendario' })).getByRole('link', { name: 'Lista' })).toBeInTheDocument();
  });
});

// ─── Programar reunión (HU-195, T-363) ───────────────────────────────────────

describe('Calendario administrativo — programar reunión', () => {
  it('el encabezado ofrece «Programar reunión» y abre el diálogo administrativo', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });
    const encabezado = screen.getByRole('heading', { level: 1, name: 'Calendario de Sprints' }).closest('header')!;
    fireEvent.click(within(encabezado).getByRole('button', { name: 'Programar reunión' }));
    expect(await screen.findByRole('dialog', { name: 'Programar reunión administrativa' })).toBeInTheDocument();
  });

  it('el día elegido (hoy o futuro) ofrece programarla ese día a las 09:00; un día pasado no', async () => {
    // El reloj del navegador en el día del escenario (6 de octubre): el 8 a las 09:00 aún no pasó.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 6, 8, 0) });
    onTestFinished(() => void vi.useRealTimers());
    renderPage('mes', '2026-10-08');
    const panel = await screen.findByRole('region', { name: /8 de octubre de 2026/ });
    fireEvent.click(within(panel).getByRole('button', { name: 'Programar reunión este día' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Programar reunión administrativa' });
    expect(within(dialogo).getByLabelText('Hora de inicio')).toHaveValue('09:00');
    cleanup();

    renderPage('mes', '2026-10-01');
    const pasado = await screen.findByRole('region', { name: /1 de octubre de 2026/ });
    expect(within(pasado).queryByRole('button', { name: 'Programar reunión este día' })).not.toBeInTheDocument();
  });
});
