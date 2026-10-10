import '@testing-library/jest-dom/vitest';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

const usersMock = vi.hoisted(() => ({ getMisTareas: vi.fn(), getDashboardStats: vi.fn(), getMe: vi.fn() }));
vi.mock('../lib/services/users', () => usersMock);

const projectsMock = vi.hoisted(() => ({ getMyProjects: vi.fn() }));
vi.mock('../lib/services/projects', () => projectsMock);

const eventsMock = vi.hoisted(() => ({ getMisEventos: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('../lib/services/events', () => eventsMock);

const sharesMock = vi.hoisted(() => ({
  getCalendariosCompartidos: vi.fn(),
  compartirCalendario: vi.fn(),
  dejarDeCompartirCalendario: vi.fn(),
  dejarDeRecibirCalendario: vi.fn(),
  getAgendaCompartida: vi.fn(),
}));
vi.mock('../lib/services/calendar-shares', () => sharesMock);

const navigationMock = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(''),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigationMock.replace, push: navigationMock.push }),
  usePathname: () => '/dashboard/calendario',
  useSearchParams: () => navigationMock.searchParams,
}));

// G04-C02: contadores de recálculo sobre las derivaciones reales (misma implementación, espiada).
vi.mock('../lib/calendar/agenda', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/calendar/agenda')>();
  return { ...real, groupAgendaItemsByDay: vi.fn(real.groupAgendaItemsByDay), eventoToAgendaItems: vi.fn(real.eventoToAgendaItems) };
});
vi.mock('../lib/calendar/vista', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/calendar/vista')>();
  return { ...real, filtrarItems: vi.fn(real.filtrarItems) };
});

// G04-C13: la cuenta autenticada se puede cambiar por prueba (dos usuarios en el mismo navegador).
const sesionMock = vi.hoisted(() => ({ usuario: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null, roles: [] as string[] } as { idUsuario: number; nombre: string; apellido: string; fotoUrl: null; roles: string[] } | undefined }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: sesionMock.usuario }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: () => ({ members: [], isLoading: false }) }));
// El mapa (leaflet) no se necesita en la página: el diálogo monta un hueco.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import CalendarioPage from '../app/dashboard/calendario/page';
import { eventoToAgendaItems, groupAgendaItemsByDay } from '../lib/calendar/agenda';
import { filtrarItems } from '../lib/calendar/vista';
import type { MiEventoDTO } from '../lib/services/events';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

/** Viernes 9 de octubre de 2026, 10:20 (America/Guatemala en las pruebas). */
const HOY = new Date(2026, 9, 9, 10, 20);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
  usersMock.getMisTareas.mockResolvedValue([]);
  usersMock.getDashboardStats.mockResolvedValue({ horasBeca: 0, horasBecaRequeridas: null, horasExtension: 0, horasExtensionRequeridas: null });
  projectsMock.getMyProjects.mockResolvedValue([]);
  eventsMock.getMisEventos.mockResolvedValue([]);
  sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
  navigationMock.searchParams = new URLSearchParams('');
  sesionMock.usuario = { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null, roles: [] };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function eventoDTO(overrides: Partial<MiEventoDTO> = {}): MiEventoDTO {
  return {
    idEvento: 7,
    idProyecto: 1,
    tituloEvento: 'Reunión semanal',
    descripcionEvento: null,
    fechaInicio: new Date(2026, 9, 9, 9, 0).toISOString(),
    fechaFin: new Date(2026, 9, 9, 10, 0).toISOString(),
    antelacionMinutos: 60,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: null,
    linkSesion: 'https://meet.google.com/abc',
    rolesDestino: [],
    tipoEvento: 'REUNION',
    invitados: [],
    proyecto: { idProyecto: 1, tituloProyecto: 'Proyecto Uno' },
    ...overrides,
  };
}

async function renderPage() {
  render(<CalendarioPage />, { wrapper });
  await waitFor(() => expect(screen.queryByText('Cargando tu calendario...')).not.toBeInTheDocument());
}

const vista = (nombre: string) => screen.getByRole('radio', { name: nombre });
const boton = (nombre: string) => screen.getByRole('button', { name: nombre });
/** Etiqueta del periodo de la barra (el mini calendario repite el nombre del mes). */
const etiquetaPeriodo = () => document.querySelector('[aria-live="polite"].type-subtitle') as HTMLElement;
const celdaMes = (dia: number, mes: string) => screen.getByRole('button', { name: new RegExp(`, ${dia} de ${mes},`) });

describe('CalendarioPage — selección obsoleta al navegar (G03-C05, UI-17)', () => {
  it('elegir el 9 de octubre en Mes y pasar a noviembre deja de filtrar por ese día (lista del mes completa, no "Nada programado ese día")', async () => {
    // La cuadrícula de noviembre empieza el lunes 26 de octubre: se responde según el rango completo.
    eventsMock.getMisEventos.mockImplementation(async (_desde: Date, hasta: Date) =>
      hasta.getTime() <= new Date(2026, 10, 12).getTime() ? [] : [eventoDTO({ idEvento: 11, tituloEvento: 'Entrega de noviembre', fechaInicio: new Date(2026, 10, 12, 9, 0).toISOString(), fechaFin: new Date(2026, 10, 12, 10, 0).toISOString() })],
    );
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(9, 'octubre'));
    expect(await screen.findByText('Nada programado ese día')).toBeInTheDocument();
    expect(boton('Ver todas las fechas')).toBeInTheDocument();

    fireEvent.click(boton('Siguiente'));
    expect(etiquetaPeriodo()).toHaveTextContent('Noviembre 2026');
    expect(screen.queryByText('Nada programado ese día')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver todas las fechas' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Entrega de noviembre/ })).toBeInTheDocument();
    expect(celdaMes(12, 'noviembre')).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Anterior" y "Hoy" también limpian un día que queda fuera del periodo; "Hoy" dentro del mismo mes lo conserva', async () => {
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(20, 'octubre'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    // Mismo periodo: la selección se mantiene.
    fireEvent.click(boton('Hoy'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(boton('Anterior'));
    expect(etiquetaPeriodo()).toHaveTextContent('Septiembre 2026');
    expect(await screen.findByText('Sin actividad en este rango')).toBeInTheDocument();

    fireEvent.click(boton('Hoy'));
    expect(etiquetaPeriodo()).toHaveTextContent('Octubre 2026');
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Sin actividad en este rango')).toBeInTheDocument();
  });

  it('abrir y cerrar el diálogo de nuevo evento o usar el filtro no borra el día elegido', async () => {
    projectsMock.getMyProjects.mockResolvedValue([{ idProyecto: 1, tituloProyecto: 'Proyecto Uno', tipoProyecto: 'BECA', estadoProyecto: 'ACTIVO' }]);
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(20, 'octubre'));

    fireEvent.click(await screen.findByRole('button', { name: 'Agendar actividad' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Todos los eventos/ }));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CalendarioPage — mini calendario sincronizado (G03-C06, UI-17)', () => {
  const mini = () => screen.getByRole('complementary', { name: 'Opciones del calendario' });
  /** Celda del mini: por defecto la del mes mostrado (las de meses vecinos llevan `text-text-disabled`). */
  const diaMini = (dia: number, fueraDeMes = false) => {
    const celda = within(mini())
      .getAllByRole('button', { name: String(dia) })
      .find((b) => b.classList.contains('text-text-disabled') === fueraDeMes);
    if (!celda) throw new Error(`sin celda ${dia} (fueraDeMes=${fueraDeMes})`);
    return celda;
  };
  const tieneMarca = (dia: number, fueraDeMes = false) => diaMini(dia, fueraDeMes).querySelector('.bg-primary') !== null;

  it('en Semana el mini marca los días con actividad de todo el mes, no solo de la semana cargada', async () => {
    eventsMock.getMisEventos.mockImplementation(async (desde: Date, hasta: Date) =>
      [eventoDTO({ idEvento: 21, tituloEvento: 'Taller del 28', fechaInicio: new Date(2026, 9, 28, 9, 0).toISOString(), fechaFin: new Date(2026, 9, 28, 10, 0).toISOString() })].filter(
        (e) => new Date(e.fechaInicio) >= desde && new Date(e.fechaInicio) < hasta,
      ),
    );
    await renderPage();
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(tieneMarca(28)).toBe(true));
    // La semana visible (5–11 oct) no contiene el 28: la marca viene del mes del mini.
    expect(screen.queryByRole('button', { name: /Taller del 28/ })).not.toBeInTheDocument();
  });

  it('"Mes siguiente" en el mini consulta el rango de noviembre y, hasta que llega, no enseña marcas del mes anterior', async () => {
    let resolverNoviembre: (eventos: MiEventoDTO[]) => void = () => {};
    eventsMock.getMisEventos.mockImplementation((desde: Date, hasta: Date) => {
      if (hasta.getTime() > new Date(2026, 10, 20).getTime()) return new Promise<MiEventoDTO[]>((resolve) => (resolverNoviembre = resolve));
      return Promise.resolve([eventoDTO({ idEvento: 21, fechaInicio: new Date(2026, 9, 28, 9, 0).toISOString(), fechaFin: new Date(2026, 9, 28, 10, 0).toISOString() })]);
    });
    await renderPage();
    await waitFor(() => expect(tieneMarca(28)).toBe(true));

    fireEvent.click(within(mini()).getByRole('button', { name: 'Mes siguiente' }));
    expect(within(mini()).getByText('Noviembre 2026')).toBeInTheDocument();
    const llamadas = eventsMock.getMisEventos.mock.calls as [Date, Date][];
    const deNoviembre = llamadas.find(([desde, hasta]) => desde <= new Date(2026, 10, 1) && hasta >= new Date(2026, 11, 1));
    expect(deNoviembre).toBeDefined();
    // El 28 de octubre también está en la cuadrícula de noviembre (fuera de mes): sin datos nuevos, sin marca.
    expect(tieneMarca(28, true)).toBe(false);

    resolverNoviembre([eventoDTO({ idEvento: 22, fechaInicio: new Date(2026, 10, 12, 9, 0).toISOString(), fechaFin: new Date(2026, 10, 12, 10, 0).toISOString() })]);
    await waitFor(() => expect(tieneMarca(12)).toBe(true));
    // La vista principal no se movió: sigue la semana de hoy.
    expect(etiquetaPeriodo()).toHaveTextContent('5 oct');
  });

  it('en Día y Semana el mini señala la fecha ancla y la sigue al navegar; en Mes señala el día elegido', async () => {
    await renderPage();
    expect(diaMini(9)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(boton('Siguiente'));
    expect(diaMini(16)).toHaveAttribute('aria-pressed', 'true');
    expect(diaMini(9)).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(vista('Día'));
    fireEvent.click(boton('Hoy'));
    expect(diaMini(9)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(vista('Mes'));
    expect(diaMini(9)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(celdaMes(20, 'octubre'));
    expect(diaMini(20)).toHaveAttribute('aria-pressed', 'true');
  });

  it('elegir un día del mini navega a esa fecha en la vista actual', async () => {
    await renderPage();
    fireEvent.click(diaMini(21));
    expect(etiquetaPeriodo()).toHaveTextContent('19 oct');
    expect(diaMini(21)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CalendarioPage — reloj vivo: línea "Ahora" y día "Hoy" (G03-C07, UI-28)', () => {
  beforeEach(() => {
    // Aquí también se fingen los intervalos (los timeouts siguen reales para
    // waitFor). Hay que salir de los timers falsos del beforeEach general:
    // una segunda llamada a useFakeTimers no cambia qué se finge.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(HOY);
  });

  const lineaAhora = () => screen.getByTestId('cuadricula-horas').querySelector<HTMLElement>('.z-10');
  const cabeceraHoy = () => within(screen.getByTestId('cuadricula-semana')).getAllByText('Hoy')[0].parentElement as HTMLElement;

  it('cada minuto la línea de "ahora" baja sin volver a pedir la agenda', async () => {
    await renderPage();
    fireEvent.click(vista('Día'));
    await waitFor(() => expect(lineaAhora()).not.toBeNull());
    const topInicial = Number.parseFloat(lineaAhora()!.style.top);
    const llamadas = eventsMock.getMisEventos.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(Number.parseFloat(lineaAhora()!.style.top)).toBeGreaterThan(topInicial);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(Number.parseFloat(lineaAhora()!.style.top)).toBeCloseTo(topInicial + (11 / 60) * 48, 3);
    expect(eventsMock.getMisEventos.mock.calls.length).toBe(llamadas);
    expect(usersMock.getMisTareas).toHaveBeenCalledTimes(1);
  });

  it('a medianoche (America/Guatemala) "Hoy" pasa al día siguiente sin recargar y la semana que se estaba viendo no cambia', async () => {
    vi.setSystemTime(new Date(2026, 9, 9, 23, 59, 30));
    await renderPage();
    expect(cabeceraHoy()).toHaveAttribute('aria-current', 'date');
    expect(cabeceraHoy()).toHaveTextContent('9');

    // El usuario navega a la semana siguiente antes de medianoche.
    fireEvent.click(boton('Siguiente'));
    expect(etiquetaPeriodo()).toHaveTextContent('12 oct');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    // Sigue viendo la semana del 12: hoy (10 oct) no está en ella y el ancla no se movió.
    expect(etiquetaPeriodo()).toHaveTextContent('12 oct');
    expect(within(screen.getByTestId('cuadricula-semana')).queryByText('Hoy')).not.toBeInTheDocument();

    fireEvent.click(boton('Hoy'));
    expect(etiquetaPeriodo()).toHaveTextContent('5 oct');
    expect(cabeceraHoy()).toHaveTextContent('10');
    expect(screen.getByRole('complementary', { name: 'Opciones del calendario' }).querySelector('[aria-current="date"]')).toHaveTextContent('10');
  });

  it('al desmontar la página el intervalo se limpia', async () => {
    const { unmount } = render(<CalendarioPage />, { wrapper });
    await waitFor(() => expect(screen.queryByText('Cargando tu calendario...')).not.toBeInTheDocument());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('CalendarioPage — estados de compartidos y de carga propia (G03-C09, UI-12/UI-39)', () => {
  it('si la lista de compartidos falla, la columna izquierda lo dice y Reintentar vuelve a pedirla; el aviso de agenda fallida sale una sola vez', async () => {
    sharesMock.getCalendariosCompartidos.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 500 })).mockResolvedValue({
      compartidoPorMi: [],
      compartidosConmigo: [{ idUsuario: 9, nombre: 'Ana', apellido: 'García', fotoUrl: null }],
    });
    sharesMock.getAgendaCompartida.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 500 }));
    window.localStorage.setItem('calendario:compartidos-activos:1', '[9]');
    await renderPage();

    const lateral = screen.getByRole('complementary', { name: 'Opciones del calendario' });
    expect(await within(lateral).findByText('No se pudieron cargar los calendarios compartidos.')).toBeInTheDocument();
    fireEvent.click(within(lateral).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(2));
    expect(await within(lateral).findByRole('checkbox', { name: 'Ver el calendario de Ana García' })).toBeChecked();

    // La agenda de Ana falla: alerta junto a ella y un solo toast aunque la página se vuelva a renderizar.
    expect(await within(lateral).findByText('No se pudo cargar este calendario.')).toBeInTheDocument();
    fireEvent.click(boton('Siguiente'));
    fireEvent.click(boton('Anterior'));
    await waitFor(() => expect(mensajesMock.aviso.error).toHaveBeenCalledTimes(1));
    expect(mensajesMock.aviso.error.mock.calls[0][0]).toBe('No se pudo cargar un calendario compartido');
  });

  it('mientras carga el calendario propio, el estado se anuncia antes de la rejilla y la zona queda aria-busy', async () => {
    // La semana y el mes del mini son dos consultas: se resuelven todas las pendientes.
    const pendientes: ((e: MiEventoDTO[]) => void)[] = [];
    eventsMock.getMisEventos.mockImplementation(() => new Promise<MiEventoDTO[]>((resolve) => pendientes.push(resolve)));
    render(<CalendarioPage />, { wrapper });

    const estado = screen.getByText('Cargando tu calendario...').closest('[role="status"]') as HTMLElement;
    expect(estado).not.toBeNull();
    const rejilla = screen.getByTestId('cuadricula-semana');
    expect(estado.compareDocumentPosition(rejilla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rejilla.closest('[aria-busy="true"]')).not.toBeNull();

    await act(async () => {
      for (const resolver of pendientes) resolver([]);
    });
    await waitFor(() => expect(screen.queryByText('Cargando tu calendario...')).not.toBeInTheDocument());
    expect(rejilla.closest('[aria-busy="true"]')).toBeNull();
  });
});

describe('CalendarioPage — abrir un calendario compartido desde la notificación (G03-C11, UI-40)', () => {
  const ANA = { idUsuario: 9, nombre: 'Ana', apellido: 'García', fotoUrl: null };

  afterEach(() => {
    window.history.replaceState(null, '', '/dashboard/calendario');
  });

  it('?compartido=<id> activa el calendario si la API lo lista, lo guarda y limpia la URL', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA] });
    sharesMock.getAgendaCompartida.mockResolvedValue({ eventos: [], tareas: [] });
    window.history.replaceState(null, '', '/dashboard/calendario?compartido=9');
    await renderPage();

    expect(await screen.findByRole('checkbox', { name: 'Ver el calendario de Ana García' })).toBeChecked();
    await waitFor(() => expect(sharesMock.getAgendaCompartida).toHaveBeenCalledWith(9, expect.any(Date), expect.any(Date)));
    expect(JSON.parse(window.localStorage.getItem('calendario:compartidos-activos:1') ?? '[]')).toEqual([9]);
    expect(window.location.search).toBe('');
    expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Calendario activado', expect.stringContaining('Ana García'));
  });

  it('un id que la API no lista (revocado o ajeno) avisa, no activa nada y no consulta ninguna agenda', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA] });
    window.history.replaceState(null, '', '/dashboard/calendario?compartido=77');
    await renderPage();

    await waitFor(() => expect(mensajesMock.aviso.advertencia).toHaveBeenCalledWith('Ese calendario ya no está compartido contigo', expect.any(String)));
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' })).not.toBeChecked();
    expect(sharesMock.getAgendaCompartida).not.toHaveBeenCalled();
    // G04-C13 (clase B): antes se exigía que la clave no existiera; ahora la preferencia se guarda
    // por usuario y ya saneada, así que "nada activado" es una lista vacía.
    expect(JSON.parse(window.localStorage.getItem('calendario:compartidos-activos:1') ?? '[]')).toEqual([]);
    expect(window.location.search).toBe('');
  });

  it('en StrictMode (montaje doble de efectos en desarrollo) la activación ocurre igual y una sola vez', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA] });
    sharesMock.getAgendaCompartida.mockResolvedValue({ eventos: [], tareas: [] });
    window.history.replaceState(null, '', '/dashboard/calendario?compartido=9');
    render(
      <StrictMode>
        <CalendarioPage />
      </StrictMode>,
      { wrapper },
    );
    await waitFor(() => expect(screen.queryByText('Cargando tu calendario...')).not.toBeInTheDocument());

    expect(await screen.findByRole('checkbox', { name: 'Ver el calendario de Ana García' })).toBeChecked();
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Calendario activado', expect.stringContaining('Ana García')));
    expect(mensajesMock.aviso.exito).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('un id inválido se ignora en silencio y la URL queda limpia conservando otros parámetros', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA] });
    window.history.replaceState(null, '', '/dashboard/calendario?compartido=abc&otro=1');
    await renderPage();
    await screen.findByRole('checkbox', { name: 'Ver el calendario de Ana García' });

    expect(window.location.search).toBe('?otro=1');
    expect(mensajesMock.aviso.advertencia).not.toHaveBeenCalled();
    expect(mensajesMock.aviso.exito).not.toHaveBeenCalled();
    expect(sharesMock.getAgendaCompartida).not.toHaveBeenCalled();
  });
});

describe('CalendarioPage — selector Día/Semana/Mes accesible (G03-C13, UI-08)', () => {
  const grupo = () => screen.getByRole('radiogroup', { name: 'Vista del calendario' });

  it('ArrowRight pasa de Semana a Mes y ArrowLeft vuelve; la vista y su navegación siguen el cambio', async () => {
    await renderPage();
    expect(vista('Semana')).toHaveAttribute('aria-checked', 'true');
    vista('Semana').focus();

    fireEvent.keyDown(vista('Semana'), { key: 'ArrowRight' });
    await waitFor(() => expect(vista('Mes')).toHaveAttribute('aria-checked', 'true'));
    expect(vista('Mes')).toHaveFocus();
    expect(etiquetaPeriodo()).toHaveTextContent('Octubre 2026');
    expect(screen.queryByTestId('cuadricula-semana')).not.toBeInTheDocument();

    fireEvent.keyDown(vista('Mes'), { key: 'ArrowLeft' });
    await waitFor(() => expect(vista('Semana')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByTestId('cuadricula-semana')).toBeInTheDocument();
    expect(etiquetaPeriodo()).toHaveTextContent('5 oct');
  });

  it('el grupo es una sola parada de tabulación: entrar enfoca la vista activa y Tab sale al siguiente control', async () => {
    await renderPage();
    const opcionesTabulables = () => within(grupo()).getAllByRole('radio').filter((el) => el.getAttribute('tabindex') === '0');
    expect(opcionesTabulables()).toHaveLength(0);
    expect(grupo()).toHaveAttribute('tabindex', '0');

    grupo().focus();
    await waitFor(() => expect(vista('Semana')).toHaveFocus());
    expect(opcionesTabulables()).toEqual([vista('Semana')]);
    expect(vista('Día')).toHaveAttribute('tabindex', '-1');
    expect(vista('Mes')).toHaveAttribute('tabindex', '-1');
  });

  it('el clic sigue funcionando y cambiar de vista limpia el día elegido en Mes', async () => {
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(20, 'octubre'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(vista('Día'));
    expect(vista('Día')).toHaveAttribute('aria-checked', 'true');
    expect(etiquetaPeriodo()).toHaveTextContent('9 de octubre');
    fireEvent.click(vista('Mes'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('CalendarioPage — foco tras Detalle → Editar → Cancelar (G03-C15, UI-10/D-17)', () => {
  it('tras cerrar el detalle con Escape, y tras Detalle → Editar → Cancelar, el foco vuelve al bloque del evento', async () => {
    projectsMock.getMyProjects.mockResolvedValue([{ idProyecto: 1, tituloProyecto: 'Proyecto Uno', tipoProyecto: 'BECA', estadoProyecto: 'ACTIVO' }]);
    eventsMock.getMisEventos.mockResolvedValue([eventoDTO()]);
    await renderPage();
    const bloque = (await screen.findAllByRole('button', { name: /^Reunión semanal, 09:00 a 10:00/ }))[0];

    fireEvent.click(bloque);
    let detalle = await screen.findByRole('dialog', { name: 'Reunión semanal' });
    fireEvent.keyDown(detalle, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bloque).toHaveFocus();

    fireEvent.click(bloque);
    detalle = await screen.findByRole('dialog', { name: 'Reunión semanal' });
    fireEvent.click(within(detalle).getByRole('button', { name: /Editar evento/ }));
    const formulario = await screen.findByRole('dialog', { name: 'Editar evento' });
    await waitFor(() => expect(formulario.contains(document.activeElement)).toBe(true));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(document.body);
    expect(bloque).toHaveFocus();
  });
});

describe('CalendarioPage — derivaciones memoizadas (G04-C02, UI-11)', () => {
  const recalculos = () => ({
    porDia: vi.mocked(groupAgendaItemsByDay).mock.calls.length,
    filtro: vi.mocked(filtrarItems).mock.calls.length,
    mapeo: vi.mocked(eventoToAgendaItems).mock.calls.length,
  });
  const ANA = { idUsuario: 9, nombre: 'Ana', apellido: 'García', fotoUrl: null };
  const LUIS = { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', fotoUrl: null };
  const bloque = (nombre: RegExp) => screen.findAllByRole('button', { name: nombre });

  it('abrir y cerrar el detalle de un evento no vuelve a agrupar, filtrar ni mapear la agenda', async () => {
    eventsMock.getMisEventos.mockResolvedValue([eventoDTO()]);
    await renderPage();
    const [evento] = await bloque(/^Reunión semanal, 09:00 a 10:00/);
    const antes = recalculos();

    fireEvent.click(evento);
    const detalle = await screen.findByRole('dialog', { name: 'Reunión semanal' });
    fireEvent.keyDown(detalle, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(recalculos()).toEqual(antes);
  });

  it('mientras los eventos siguen cargando, un render ajeno (abrir "Compartir agenda") no recalcula con un vacío nuevo cada vez', async () => {
    eventsMock.getMisEventos.mockImplementation(() => new Promise<MiEventoDTO[]>(() => {}));
    render(<CalendarioPage />, { wrapper });
    await waitFor(() => expect(usersMock.getMisTareas).toHaveBeenCalled());
    await screen.findByText('Nadie te ha compartido su calendario todavía.');
    const antes = recalculos();

    fireEvent.click(screen.getByRole('button', { name: 'Compartir agenda' }));
    const compartir = await screen.findByRole('dialog', { name: 'Compartir mi agenda' });
    fireEvent.keyDown(compartir, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(recalculos()).toEqual(antes);
  });

  it('el tick del reloj mueve la línea de "ahora" sin recalcular la agenda', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(HOY);
    eventsMock.getMisEventos.mockResolvedValue([eventoDTO()]);
    await renderPage();
    await bloque(/^Reunión semanal, 09:00 a 10:00/);
    const antes = recalculos();

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(recalculos()).toEqual(antes);
  });

  it('activar otra agenda sí actualiza el contenido y hace su propia petición, sin volver a pedir la que ya estaba', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA, LUIS] });
    sharesMock.getAgendaCompartida.mockImplementation(async (id: number) =>
      id === LUIS.idUsuario
        ? {
            eventos: [
              {
                idEvento: 901,
                fechaInicio: new Date(2026, 9, 9, 11, 0).toISOString(),
                fechaFin: new Date(2026, 9, 9, 12, 0).toISOString(),
                visibilidad: 'DETALLE',
                tituloEvento: 'Revisión con Luis',
                tipoEvento: 'REVISION',
                modalidad: 'VIRTUAL',
                proyecto: { idProyecto: 1, tituloProyecto: 'Proyecto Uno' },
              },
            ],
            tareas: [],
          }
        : { eventos: [{ idEvento: 900, fechaInicio: new Date(2026, 9, 9, 14, 0).toISOString(), fechaFin: new Date(2026, 9, 9, 15, 0).toISOString(), visibilidad: 'OCUPADO' }], tareas: [] },
    );
    window.localStorage.setItem('calendario:compartidos-activos:1', '[5]');
    await renderPage();
    await bloque(/^Revisión con Luis, 11:00 a 12:00, calendario de Luis Hernández/);
    expect(screen.queryByRole('button', { name: /^Ocupado/ })).not.toBeInTheDocument();
    const antes = recalculos();
    const pedidas = (id: number) => sharesMock.getAgendaCompartida.mock.calls.filter(([propietario]) => propietario === id).length;
    expect(pedidas(LUIS.idUsuario)).toBe(1);
    expect(pedidas(ANA.idUsuario)).toBe(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' }));
    await bloque(/^Ocupado, 14:00 a 15:00, calendario de Ana García/);

    expect(pedidas(ANA.idUsuario)).toBe(1);
    expect(pedidas(LUIS.idUsuario)).toBe(1);
    expect(recalculos().porDia).toBeGreaterThan(antes.porDia);
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Luis Hernández' })).toBeChecked();
  });
});

describe('CalendarioPage — una sola representación de Semana montada (G04-C03, UI-36/UI-02)', () => {
  /** Simula `matchMedia('(min-width: 80rem)')` (breakpoint xl) y permite cambiar el ancho. */
  function simularAncho(amplio: boolean) {
    let coincide = amplio;
    const oyentes = new Set<() => void>();
    const consultas: string[] = [];
    window.matchMedia = ((consulta: string) => {
      consultas.push(consulta);
      return {
        get matches() {
          return coincide;
        },
        media: consulta,
        addEventListener: (_tipo: string, oyente: () => void) => oyentes.add(oyente),
        removeEventListener: (_tipo: string, oyente: () => void) => oyentes.delete(oyente),
      };
    }) as unknown as typeof window.matchMedia;
    return {
      consultas,
      oyentes,
      cambiar(valor: boolean) {
        coincide = valor;
        act(() => oyentes.forEach((oyente) => oyente()));
      },
    };
  }

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const cuadricula = () => screen.queryByTestId('cuadricula-semana');
  const listaSemana = () => screen.queryByText(/· Hoy/);

  it('en un ancho amplio solo existe la cuadrícula por horas: la lista de días no está en el DOM', async () => {
    const ancho = simularAncho(true);
    eventsMock.getMisEventos.mockResolvedValue([eventoDTO()]);
    await renderPage();

    expect(cuadricula()).toBeInTheDocument();
    expect(listaSemana()).not.toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: /^Reunión semanal, 09:00 a 10:00/ })).toHaveLength(1);
    expect(ancho.consultas).toContain('(min-width: 80rem)');
  });

  it('en un ancho estrecho solo existe la lista de días: la cuadrícula (24 filas × 7 columnas) no se monta', async () => {
    simularAncho(false);
    eventsMock.getMisEventos.mockResolvedValue([eventoDTO()]);
    await renderPage();

    expect(cuadricula()).not.toBeInTheDocument();
    expect(screen.queryByTestId('cuadricula-horas')).not.toBeInTheDocument();
    expect(listaSemana()).toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: /Reunión semanal/ })).toHaveLength(1);
  });

  it('al ensanchar (rotar o redimensionar) se monta la cuadrícula con el scroll en las 07:00 y al estrechar vuelve la lista', async () => {
    const ancho = simularAncho(false);
    await renderPage();
    expect(cuadricula()).not.toBeInTheDocument();

    ancho.cambiar(true);
    const horas = await screen.findByTestId('cuadricula-horas');
    expect(listaSemana()).not.toBeInTheDocument();
    expect(horas.scrollTop).toBe(7 * 48 - 12);

    ancho.cambiar(false);
    expect(cuadricula()).not.toBeInTheDocument();
    expect(listaSemana()).toBeInTheDocument();
  });

  it('cambiar de vista y navegar sigue funcionando con una sola variante, y la vista Día no depende del ancho', async () => {
    simularAncho(false);
    await renderPage();
    fireEvent.click(vista('Día'));
    expect(screen.getByTestId('cuadricula-horas')).toBeInTheDocument();
    fireEvent.click(vista('Semana'));
    expect(screen.queryByTestId('cuadricula-horas')).not.toBeInTheDocument();
    fireEvent.click(boton('Siguiente'));
    expect(etiquetaPeriodo()).toHaveTextContent('12 oct');
    expect(cuadricula()).not.toBeInTheDocument();
  });

  it('al desmontar la página deja de escuchar el cambio de ancho', async () => {
    const ancho = simularAncho(true);
    const { unmount } = render(<CalendarioPage />, { wrapper });
    await waitFor(() => expect(ancho.oyentes.size).toBeGreaterThan(0));
    unmount();
    expect(ancho.oyentes.size).toBe(0);
  });

  it('sin matchMedia (servidor e hidratación) se conserva el respaldo por CSS con ambas variantes y sus clases', async () => {
    await renderPage();
    expect(cuadricula()?.closest('.hidden.xl\\:block')).not.toBeNull();
    expect(listaSemana()?.closest('.xl\\:hidden')).not.toBeNull();
  });
});

describe('CalendarioPage — jerarquía de encabezados y grupos con nombre (G04-C07, UI-32)', () => {
  it('los encabezados no saltan niveles: h1 de la página, h2 del periodo y de la columna, h3 de sus secciones', async () => {
    usersMock.getDashboardStats.mockResolvedValue({ horasBeca: 10, horasBecaRequeridas: 40, horasExtension: 0, horasExtensionRequeridas: null });
    await renderPage();
    await screen.findByRole('heading', { name: 'Meta de horas' });
    const niveles = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    expect(niveles[0]).toBe(1);
    expect(niveles.filter((n) => n === 1)).toHaveLength(1);
    // Regla de axe `heading-order`: nunca se baja más de un nivel de golpe.
    niveles.forEach((nivel, i) => {
      if (i > 0) expect(nivel - niveles[i - 1]).toBeLessThanOrEqual(1);
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Opciones del calendario' })).toHaveClass('sr-only');
    for (const seccion of ['Meta de horas', 'Mis proyectos', 'Calendarios compartidos conmigo']) {
      expect(screen.getByRole('heading', { level: 3, name: seccion })).toBeInTheDocument();
    }
  });

  it('el periodo visible es un h2 con aria-live que sigue a la navegación y a la vista', async () => {
    await renderPage();
    const periodo = screen.getByRole('heading', { level: 2, name: /5 oct/ });
    expect(periodo).toBe(etiquetaPeriodo());
    expect(periodo).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(vista('Mes'));
    expect(screen.getByRole('heading', { level: 2, name: 'Octubre 2026' })).toBeInTheDocument();
  });

  it('las cabeceras del mes dicen el nombre completo del día (dos "M" distintas) sin cambiar lo que se ve', async () => {
    await renderPage();
    fireEvent.click(vista('Mes'));
    const rejilla = celdaMes(20, 'octubre').closest('.card-base') as HTMLElement;
    const cabeceras = [...(rejilla.firstElementChild as HTMLElement).children] as HTMLElement[];
    expect(cabeceras.map((c) => c.querySelector('[aria-hidden="true"]')?.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(cabeceras.map((c) => c.querySelector('.sr-only')?.textContent)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']);
  });

  it('los avatares de "compartida con" forman un grupo con nombre (aria-label ya no cuelga de un div sin rol)', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({
      compartidoPorMi: [{ idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', fotoUrl: null, correo: 'luis@uvg.edu.gt' }],
      compartidosConmigo: [],
    });
    await renderPage();
    expect(await screen.findByRole('group', { name: 'Compartida con 1 personas' })).toBeInTheDocument();
  });
});

describe('CalendarioPage — periodo corto en pantallas estrechas con nombre accesible completo (G04-C08, UI-38)', () => {
  const corto = () => etiquetaPeriodo().querySelector('[aria-hidden="true"]');

  it('en Semana se muestra "5 – 11 oct 2026" bajo sm y el encabezado sigue llamándose con el rango completo', async () => {
    await renderPage();
    expect(corto()).toHaveTextContent(/^5 – 11 oct 2026$/);
    expect(corto()).toHaveClass('sm:hidden');
    expect(screen.getByRole('heading', { level: 2, name: '5 oct – 11 oct 2026' })).toBe(etiquetaPeriodo());
    expect(etiquetaPeriodo().querySelector('.sr-only')).toHaveClass('sm:not-sr-only');
  });

  it('una semana que cruza de mes se abrevia con ambos meses', async () => {
    await renderPage();
    fireEvent.click(boton('Anterior'));
    expect(corto()).toHaveTextContent(/^28 sept – 4 oct$/);
    expect(screen.getByRole('heading', { level: 2, name: '28 sept – 4 oct 2026' })).toBeInTheDocument();
  });

  it('en Día se muestra "Vie, 9 oct 2026" y el nombre accesible conserva la fecha larga', async () => {
    await renderPage();
    fireEvent.click(vista('Día'));
    expect(corto()).toHaveTextContent(/^Vie, 9 oct 2026$/);
    expect(screen.getByRole('heading', { level: 2, name: 'Viernes, 9 de octubre de 2026' })).toBeInTheDocument();
  });

  it('en Mes el nombre ya es corto: un solo texto, sin duplicado oculto', async () => {
    await renderPage();
    fireEvent.click(vista('Mes'));
    expect(etiquetaPeriodo().textContent).toBe('Octubre 2026');
    expect(corto()).toBeNull();
  });
});

describe('CalendarioPage — calendarios activos guardados por usuario (G04-C13, UI-29)', () => {
  const ANA = { idUsuario: 9, nombre: 'Ana', apellido: 'García', fotoUrl: null };
  const LUIS = { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', fotoUrl: null };
  const CLAVE_LEGADA = 'calendario:compartidos-activos';
  const clave = (idUsuario: number) => `${CLAVE_LEGADA}:${idUsuario}`;
  const guardado = (idUsuario: number) => window.localStorage.getItem(clave(idUsuario));
  const casilla = (nombre: string) => screen.findByRole('checkbox', { name: `Ver el calendario de ${nombre}` });
  const usuario = (idUsuario: number) => ({ idUsuario, nombre: 'Persona', apellido: String(idUsuario), fotoUrl: null, roles: [] });

  beforeEach(() => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [ANA, LUIS] });
    sharesMock.getAgendaCompartida.mockResolvedValue({ eventos: [], tareas: [] });
  });

  it('dos cuentas en el mismo navegador no heredan preferencias: cada una lee y escribe su propia clave', async () => {
    window.localStorage.setItem(clave(1), '[9]');
    const { unmount } = render(<CalendarioPage />, { wrapper });
    expect(await casilla('Ana García')).toBeChecked();
    expect(await casilla('Luis Hernández')).not.toBeChecked();
    unmount();

    // Otra persona inicia sesión en el mismo navegador.
    sesionMock.usuario = usuario(2);
    render(<CalendarioPage />, { wrapper });
    expect(await casilla('Ana García')).not.toBeChecked();
    fireEvent.click(await casilla('Luis Hernández'));
    await waitFor(() => expect(guardado(2)).toBe('[5]'));
    expect(guardado(1)).toBe('[9]');
  });

  it('si la cuenta cambia sin recargar la página, lo activado por la anterior deja de aplicarse y no se consulta su agenda', async () => {
    window.localStorage.setItem(clave(1), '[9]');
    const { rerender } = render(<CalendarioPage />, { wrapper });
    expect(await casilla('Ana García')).toBeChecked();
    await waitFor(() => expect(sharesMock.getAgendaCompartida).toHaveBeenCalledTimes(1));

    sesionMock.usuario = usuario(2);
    rerender(<CalendarioPage />);
    await waitFor(async () => expect(await casilla('Ana García')).not.toBeChecked());
    expect(guardado(1)).toBe('[9]');
    expect(guardado(2)).toBe('[]');
  });

  it('la clave global anterior (sin usuario) no se aplica a nadie y se elimina', async () => {
    window.localStorage.setItem(CLAVE_LEGADA, '[9]');
    await renderPage();
    expect(await casilla('Ana García')).not.toBeChecked();
    await waitFor(() => expect(window.localStorage.getItem(CLAVE_LEGADA)).toBeNull());
    expect(sharesMock.getAgendaCompartida).not.toHaveBeenCalled();
  });

  it('un calendario revocado desaparece de los activos y del almacenamiento, sin consultar su agenda', async () => {
    window.localStorage.setItem(clave(1), '[9,77]');
    await renderPage();
    expect(await casilla('Ana García')).toBeChecked();
    await waitFor(() => expect(guardado(1)).toBe('[9]'));
    expect(sharesMock.getAgendaCompartida.mock.calls.every(([id]) => id === 9)).toBe(true);
  });

  it('si ya nadie me comparte su calendario, la preferencia guardada queda vacía', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    window.localStorage.setItem(clave(1), '[9]');
    await renderPage();
    await screen.findByText('Nadie te ha compartido su calendario todavía.');
    await waitFor(() => expect(guardado(1)).toBe('[]'));
    expect(sharesMock.getAgendaCompartida).not.toHaveBeenCalled();
  });

  it('si la lista de calendarios no se pudo cargar, la preferencia guardada no se toca', async () => {
    sharesMock.getCalendariosCompartidos.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 500 }));
    window.localStorage.setItem(clave(1), '[9]');
    await renderPage();
    await screen.findByText('No se pudieron cargar los calendarios compartidos.', {}, { timeout: 4000 });
    expect(guardado(1)).toBe('[9]');
  });

  it.each([
    ['no es JSON', 'no-json'],
    ['un objeto', '{"9":true}'],
    ['ids no válidos mezclados', '["9", -1, 0, 1.5, null, 9, 9, 5]'],
  ])('un valor guardado corrupto (%s) se ignora o se sanea: solo cuentan enteros positivos sin repetir', async (_caso, valor) => {
    window.localStorage.setItem(clave(1), valor);
    await renderPage();
    await casilla('Ana García');
    await waitFor(() => expect(guardado(1)).toMatch(/^\[(\d+(,\d+)*)?\]$/));
    const ids = JSON.parse(guardado(1) as string) as number[];
    expect(ids).toEqual(valor.includes('9, 9, 5') ? [9, 5] : []);
  });

  it('solo se guardan identificadores numéricos: ni nombres, ni correos, ni datos de proyecto', async () => {
    await renderPage();
    fireEvent.click(await casilla('Ana García'));
    await waitFor(() => expect(guardado(1)).toBe('[9]'));
    const todo = JSON.stringify({ ...window.localStorage });
    expect(todo).not.toMatch(/Ana|García|uvg\.edu|Proyecto/);
  });

  it('sin sesión resuelta todavía (primer render, hidratación) no se lee ni se escribe nada', async () => {
    sesionMock.usuario = undefined;
    window.localStorage.setItem(clave(1), '[9]');
    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    await renderPage();
    expect(await casilla('Ana García')).not.toBeChecked();
    expect(escribir).not.toHaveBeenCalled();
    escribir.mockRestore();
  });
});
