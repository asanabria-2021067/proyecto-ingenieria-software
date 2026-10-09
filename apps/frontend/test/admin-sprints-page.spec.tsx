import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import AdminSprintsClient from '../app/dashboard/admin/sprints/admin-sprints-client';
import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import type { AdminSprintCalendar, AdminSprintCalendarItem } from '../lib/types/admin-sprints';

const getCalendarMock = vi.mocked(getAdminSprintCalendar);

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

function renderPage(vista?: 'mes' | 'lista', fecha?: string) {
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
  return within(screen.getByRole('table'))
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

    searchParamsMock.mockReturnValue(new URLSearchParams('vista=semana'));
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
    const lista = panel.getByRole('list', { name: 'Sprints que finalizan el 8 de octubre de 2026' });
    const tarjetas = within(lista).getAllByRole('listitem');
    expect(tarjetas).toHaveLength(2);
    for (const tarjeta of tarjetas) expect(tarjeta).toHaveClass('card-base');
    // La fecha y el conteo viven en su propia tarjeta, fuera de la lista.
    const fecha = panel.getByRole('heading', { level: 2, name: '8 de octubre de 2026' });
    expect(lista).not.toContainElement(fecha);
    expect(lista).not.toHaveTextContent('2 finalizaciones planificadas');
    expect(fecha.closest('.card-base')).toHaveTextContent('2 finalizaciones planificadas');
    // Sin desbordamiento no hay flechas de carrusel.
    expect(panel.queryByRole('button', { name: /^Sprints (anteriores|siguientes)$/ })).not.toBeInTheDocument();
  });

  it('un día sin finalizaciones lo dice en su propia tarjeta de vacío, aparte de la fecha', async () => {
    renderPage('mes');
    await screen.findByRole('heading', { level: 2, name: 'Octubre 2026' });

    fireEvent.click(dia(/^9 de octubre de 2026,/));
    const mensaje = within(detalle()).getByText('No hay finalizaciones planificadas para este día.');
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

  it('sin Sprints operables lo explica y no pinta calendario ni tabla', async () => {
    getCalendarMock.mockResolvedValue(calendario([]));
    renderPage('mes');
    expect(await screen.findByText('No hay Sprints operables para supervisar.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
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

    expect(within(detalle()).getByText('No hay finalizaciones planificadas para este día.')).toBeInTheDocument();
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
