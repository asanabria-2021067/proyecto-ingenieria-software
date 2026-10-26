import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/services/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/notifications')>();
  return {
    ...actual,
    getNotificacionesPagina: vi.fn(),
    getProyectosDeNotificaciones: vi.fn(),
    getConteoNoLeidas: vi.fn(),
    marcarLeida: vi.fn(),
    marcarTodasLeidas: vi.fn(),
  };
});
vi.mock('../lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
// Radix Select en jsdom (mismo apaño que los specs de administración).
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import {
  getConteoNoLeidas,
  getNotificacionesPagina,
  getProyectosDeNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  type FiltrosBandeja,
  type Notificacion,
} from '../lib/services/notifications';
import { aviso } from '../lib/mensajes';
import { NotificationInbox } from '../components/notifications/notification-inbox';
import { BUSQUEDA_DEBOUNCE_MS } from '../components/notifications/inbox-toolbar';

/**
 * Sprint 10 — bandeja de notificaciones sobre servicios simulados: filas,
 * visor, lectura al abrir, filtros que viajan al servidor y marcado acotado.
 */

// Mediodía de hoy: los avisos «de hace 1 y 2 horas» caen siempre en «Hoy» (con el reloj real, entre las
// 00:00 y las 02:00 pasaban a «Ayer» y la prueba fallaba según la hora).
const HOY = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();
const iso = (horas: number) => new Date(HOY.getTime() - horas * 3_600_000).toISOString();

const AVISOS: Notificacion[] = [
  { idNotificacion: 1, idUsuario: 9, tipoNotificacion: 'TAREA_ASIGNADA', tituloNotificacion: 'Te asignaron la tarea Diseño', mensajeNotificacion: 'Revisa el tablero.', datosJson: { projectId: 4, taskId: 7, projectTitle: 'Tutorías' }, creadaEn: iso(1), leidaEn: null },
  { idNotificacion: 2, idUsuario: 9, tipoNotificacion: 'HORAS_CONSOLIDADAS', tituloNotificacion: 'Horas consolidadas del Sprint', mensajeNotificacion: 'Se consolidaron 5 horas.', datosJson: { projectId: 4, numeroSprint: 3, horasReportadas: '5.00' }, creadaEn: iso(2), leidaEn: iso(1) },
  { idNotificacion: 3, idUsuario: 9, tipoNotificacion: 'REUNION_CANCELADA', tituloNotificacion: 'Reunión de Administración cancelada', mensajeNotificacion: 'Se canceló la reunión.', datosJson: { meetingId: 1, eventTitle: 'Seguimiento', fechaInicioTexto: 'lunes 3' }, creadaEn: iso(30), leidaEn: null },
];

/** Última llamada al servicio con un filtro dado (la bandeja hace varias consultas de conteo). */
const llamadasDeLista = () =>
  vi.mocked(getNotificacionesPagina).mock.calls.filter(([, filtros]) => filtros && 'orden' in filtros) as [number, FiltrosBandeja][];

function responderPagina(filtros: FiltrosBandeja = {}) {
  let data = AVISOS;
  if (filtros.leida === false) data = data.filter((n) => n.leidaEn === null);
  if (filtros.leida === true) data = data.filter((n) => n.leidaEn !== null);
  if (filtros.tipos) data = data.filter((n) => filtros.tipos!.includes(n.tipoNotificacion));
  if (filtros.q) data = data.filter((n) => n.tituloNotificacion.toLowerCase().includes(filtros.q!.toLowerCase()));
  return Promise.resolve({ data, total: data.length, page: 1, totalPages: 1 });
}

function renderInbox() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationInbox />
    </QueryClientProvider>,
  );
}

const lista = () => screen.getByRole('region', { name: 'Bandeja de entrada' });
/** Abre un Select de la barra de filtros y elige una opción. */
function elegir(nombreSelect: string, opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: nombreSelect }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}
const filas = () => within(lista()).getAllByRole('listitem');

beforeEach(() => {
  // Solo la fecha: React Query y waitFor siguen con temporizadores reales.
  vi.useFakeTimers({ toFake: ['Date'], now: HOY });
  // react-resizable-panels mide el grupo con ResizeObserver, que jsdom no trae.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(getNotificacionesPagina).mockImplementation((_page, filtros) => responderPagina(filtros));
  vi.mocked(getProyectosDeNotificaciones).mockResolvedValue([{ idProyecto: 4, tituloProyecto: 'Tutorías' }]);
  vi.mocked(getConteoNoLeidas).mockResolvedValue({ total: 2, porTipo: { TAREA_ASIGNADA: 1, REUNION_CANCELADA: 1 } });
  vi.mocked(marcarLeida).mockImplementation(async (id) => ({ ...AVISOS.find((n) => n.idNotificacion === id)!, leidaEn: iso(0) }));
  vi.mocked(marcarTodasLeidas).mockResolvedValue({ actualizadas: 2 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('NotificationInbox', () => {
  it('muestra el encabezado dentro de la bandeja, las filas compactas y el visor vacío', async () => {
    renderInbox();
    expect(await screen.findByText('2 nuevas')).toBeInTheDocument();
    // El título de la página vive en la columna de la bandeja, sin cabecera aparte.
    expect(within(lista()).getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeInTheDocument();
    expect(within(lista()).getByRole('heading', { level: 2, name: 'Bandeja de entrada' })).toBeInTheDocument();
    expect(await within(lista()).findByText('3 avisos · 2 sin leer')).toBeInTheDocument();
    expect(filas()).toHaveLength(3);
    expect(filas()[0]).toHaveAttribute('data-leida', 'false');
    expect(within(filas()[0]).getByText('Tutorías')).toBeInTheDocument();
    expect(within(filas()[1]).getByText('Horas y reconocimiento')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona una notificación');
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeEnabled();
    // Sin sidebar secundaria: categoría y proyecto son selects de la barra de filtros, y el orden un botón de dos estados.
    expect(screen.queryByRole('complementary', { name: 'Carpetas de notificaciones' })).not.toBeInTheDocument();
    expect(within(lista()).getByRole('combobox', { name: 'Filtrar por categoría' })).toHaveTextContent('Todas las categorías');
    expect(within(lista()).getByRole('combobox', { name: 'Filtrar por proyecto' })).toHaveTextContent('Todos los proyectos');
    expect(within(lista()).getByRole('button', { name: /^Orden: más recientes primero/ })).toHaveTextContent('Más recientes');
    // Un solo conteo global: ninguna petición por categoría.
    expect(vi.mocked(getNotificacionesPagina).mock.calls.filter(([, f]) => f?.tipos && !('orden' in (f ?? {})))).toHaveLength(0);
    // El filtro inicial viaja al servidor sin leída, sin búsqueda y con orden descendente.
    expect(llamadasDeLista()[0][1]).toEqual({ tipos: undefined, q: undefined, proyecto: undefined, leida: undefined, orden: 'desc' });
  });

  it('abrir un aviso no leído lo muestra en el visor y lo marca leído una sola vez', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    const fila = within(filas()[0]).getByRole('button');
    fireEvent.click(fila);
    expect(fila).toHaveAttribute('aria-current', 'true');
    const visor = screen.getByRole('article');
    expect(within(visor).getByRole('heading', { level: 3, name: 'Te asignaron la tarea Diseño' })).toBeInTheDocument();
    expect(within(visor).getByRole('link', { name: 'Ver tarea' })).toHaveAttribute('href', '/dashboard/projects/4/kanban/tasks/7');
    expect(within(visor).getByRole('link', { name: 'Tutorías' })).toHaveAttribute('href', '/dashboard/proyectos/4');
    // TanStack Query pasa un segundo argumento de contexto a mutationFn.
    await waitFor(() => expect(vi.mocked(marcarLeida).mock.calls[0]?.[0]).toBe(1));
    fireEvent.click(fila);
    fireEvent.click(fila);
    expect(marcarLeida).toHaveBeenCalledTimes(1);
    // Un aviso ya leído no ofrece «Marcar como leída».
    fireEvent.click(within(filas()[1]).getByRole('button'));
    expect(screen.queryByRole('button', { name: 'Marcar como leída' })).not.toBeInTheDocument();
    expect(marcarLeida).toHaveBeenCalledTimes(1);
  });

  it('anterior y siguiente recorren la lista cargada; una reunión cancelada no enlaza', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.click(within(filas()[0]).getByRole('button'));
    expect(screen.getByRole('button', { name: 'Notificación anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Notificación siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notificación siguiente' }));
    const visor = screen.getByRole('article');
    expect(within(visor).getByRole('heading', { level: 3, name: 'Reunión de Administración cancelada' })).toBeInTheDocument();
    expect(within(visor).getAllByText('Reunión cancelada').length).toBeGreaterThan(0);
    expect(within(visor).getByRole('note')).toHaveTextContent('cancelada');
    expect(within(visor).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificación siguiente' })).toBeDisabled();
    expect(within(filas()[2]).getByRole('button')).toHaveAttribute('aria-current', 'true');
  });

  it('las pestañas y las categorías cambian el filtro del servidor y el texto del marcado', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.click(screen.getByRole('radio', { name: 'No leídas' }));
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].leida).toBe(false));
    await within(lista()).findByText('2 avisos · 2 sin leer');
    // Solo «No leídas» no acota nada: el marcado sigue siendo el de todas.
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeEnabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Todas' }));
    elegir('Filtrar por categoría', 'Recordatorios y calendario');
    expect(screen.getByRole('combobox', { name: 'Filtrar por categoría' })).toHaveTextContent('Recordatorios y calendario');
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].tipos).toEqual(expect.arrayContaining(['REUNION_PROGRAMADA', 'REUNION_CANCELADA'])));
    expect(llamadasDeLista().at(-1)?.[1].leida).toBeUndefined();
    await within(lista()).findByText('1 aviso · 1 sin leer');
    const boton = screen.getByRole('button', { name: 'Marcar como leídas las de esta categoría' });
    fireEvent.click(boton);
    await waitFor(() => expect(marcarTodasLeidas).toHaveBeenCalledTimes(1));
    const filtros = vi.mocked(marcarTodasLeidas).mock.calls[0][0]!;
    expect(filtros.tipos).toEqual(expect.arrayContaining(['REUNION_PROGRAMADA']));
    expect(filtros.q).toBeUndefined();
    expect(filtros.proyecto).toBeUndefined();
    expect(aviso.exito).toHaveBeenCalled();
  });

  it('la búsqueda espera el retardo, viaja al servidor y se limpia con su botón', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    const campo = screen.getByRole('textbox', { name: 'Buscar notificaciones por título o contenido' });
    fireEvent.change(campo, { target: { value: 'horas' } });
    expect(llamadasDeLista().at(-1)?.[1].q).toBeUndefined();
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].q).toBe('horas'), { timeout: BUSQUEDA_DEBOUNCE_MS + 1_000 });
    await within(lista()).findByText('1 aviso · 0 sin leer');
    expect(screen.getByRole('button', { name: 'Marcar filtradas como leídas' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(campo).toHaveValue('');
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].q).toBeUndefined());
  });

  it('sin resultados ofrece limpiar filtros; un error ofrece reintentar', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar notificaciones por título o contenido' }), { target: { value: 'zzz' } });
    await screen.findByText('Sin resultados', undefined, { timeout: BUSQUEDA_DEBOUNCE_MS + 1_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await within(lista()).findByText('3 avisos · 2 sin leer');

    vi.mocked(getNotificacionesPagina).mockRejectedValue(new Error('500'));
    fireEvent.click(screen.getByRole('radio', { name: 'Leídas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las notificaciones');
    vi.mocked(getNotificacionesPagina).mockImplementation((_page, filtros) => responderPagina(filtros));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await within(lista()).findByText('1 aviso · 0 sin leer');
  });

  it('las flechas mueven la selección entre filas y la leen al abrir', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    const primera = within(filas()[0]).getByRole('button');
    fireEvent.click(primera);
    await act(async () => {
      fireEvent.keyDown(primera, { key: 'ArrowDown' });
    });
    expect(within(filas()[1]).getByRole('button')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('article')).toHaveTextContent('Horas consolidadas del Sprint');
  });

  it('al cambiar de categoría, un aviso abierto que ya no pertenece al resultado deja el visor vacío', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.click(within(filas()[1]).getByRole('button'));
    expect(screen.getByRole('article')).toHaveTextContent('Horas consolidadas del Sprint');

    elegir('Filtrar por categoría', 'Recordatorios y calendario');
    await within(lista()).findByText('1 aviso · 1 sin leer');
    expect(within(lista()).queryByText('Horas consolidadas del Sprint')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona una notificación');
    expect(screen.getByRole('button', { name: 'Notificación siguiente' })).toBeDisabled();

    // Si el aviso sigue en el resultado (p. ej. solo cambia el orden), la selección se conserva.
    elegir('Filtrar por categoría', 'Todas las categorías');
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.click(within(filas()[1]).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /^Orden: más recientes primero/ }));
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].orden).toBe('asc'));
    await within(lista()).findByText('3 avisos · 2 sin leer');
    expect(screen.getByRole('article')).toHaveTextContent('Horas consolidadas del Sprint');
  });

  it('bajo «No leídas», leer el aviso abierto no vacía el visor aunque la lista deje de mostrarlo', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    fireEvent.click(screen.getByRole('radio', { name: 'No leídas' }));
    await within(lista()).findByText('2 avisos · 2 sin leer');
    fireEvent.click(within(filas()[0]).getByRole('button'));
    await waitFor(() => expect(vi.mocked(marcarLeida).mock.calls[0]?.[0]).toBe(1));
    // Tras releer, la lista (solo no leídas) ya no incluye el aviso 1; el visor lo conserva.
    AVISOS[0] = { ...AVISOS[0], leidaEn: iso(0) };
    fireEvent.click(screen.getByRole('button', { name: 'Notificación siguiente' }));
    await waitFor(() => expect(screen.getByRole('article')).toHaveTextContent('Reunión de Administración cancelada'));
    AVISOS[0] = { ...AVISOS[0], leidaEn: null };
  });

  it('el botón de orden alterna entre recientes y antiguas y manda el orden al servidor', async () => {
    renderInbox();
    await within(lista()).findByText('3 avisos · 2 sin leer');
    const boton = () => within(lista()).getByRole('button', { name: /^Orden:/ });
    expect(boton()).toHaveAttribute('data-orden', 'desc');
    fireEvent.click(boton());
    expect(boton()).toHaveAttribute('data-orden', 'asc');
    expect(boton()).toHaveTextContent('Más antiguas');
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].orden).toBe('asc'));
    fireEvent.click(boton());
    expect(boton()).toHaveTextContent('Más recientes');
    await waitFor(() => expect(llamadasDeLista().at(-1)?.[1].orden).toBe('desc'));
  });
});
