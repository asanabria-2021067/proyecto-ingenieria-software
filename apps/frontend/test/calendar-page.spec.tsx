import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
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

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null, roles: [] } }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: () => ({ members: [], isLoading: false }) }));
// El mapa (leaflet) no se necesita en la página: el diálogo monta un hueco.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import CalendarioPage from '../app/dashboard/calendario/page';
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
    window.localStorage.setItem('calendario:compartidos-activos', '[9]');
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
