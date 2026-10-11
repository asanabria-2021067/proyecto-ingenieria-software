import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sharesMock = vi.hoisted(() => ({
  getCalendariosCompartidos: vi.fn(),
  compartirCalendario: vi.fn(),
  dejarDeCompartirCalendario: vi.fn(),
  dejarDeRecibirCalendario: vi.fn(),
  getAgendaCompartida: vi.fn(),
}));
vi.mock('../lib/services/calendar-shares', () => sharesMock);

import {
  calendariosCompartidosQueryKey,
  useAgendasCompartidas,
  useCalendariosCompartidos,
  useCompartirCalendario,
  useDejarDeCompartirCalendario,
  useDejarDeRecibirCalendario,
} from '../hooks/use-calendar-shares';
import type { AgendaCompartidaDTO } from '../lib/services/calendar-shares';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ANA = 9;
const LUIS = 5;
const DESDE = new Date(2026, 9, 5);
const HASTA = new Date(2026, 9, 12);
const AGENDA_LUIS: AgendaCompartidaDTO = {
  eventos: [{ idEvento: 1, fechaInicio: DESDE.toISOString(), fechaFin: DESDE.toISOString(), visibilidad: 'OCUPADO' }],
  tareas: [],
};

function errorHttp(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return createElement(QueryClientProvider, { client }, children);
}

function renderAgendas(ids: number[]) {
  return renderHook(() => useAgendasCompartidas(ids, DESDE, HASTA), { wrapper });
}

describe('useAgendasCompartidas — estado por persona (G03-C08, UI-12)', () => {
  it('un 403 (revocación) en una persona no oculta la agenda de la otra, se marca como revocada y no se reintenta', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => (id === ANA ? Promise.reject(errorHttp(403)) : Promise.resolve(AGENDA_LUIS)));
    const { result } = renderAgendas([ANA, LUIS]);

    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true));
    await waitFor(() => expect(result.current.agendas.get(LUIS)).toEqual(AGENDA_LUIS));
    expect(result.current.agendas.has(ANA)).toBe(false);
    expect(result.current.estados.get(ANA)).toMatchObject({ isError: true, statusCode: 403, revocada: true, isLoading: false });
    expect(result.current.estados.get(LUIS)).toMatchObject({ isError: false, revocada: false, isLoading: false });
    expect(result.current.isError).toBe(true);
    expect(sharesMock.getAgendaCompartida.mock.calls.filter(([id]) => id === ANA)).toHaveLength(1);
  });

  it('un 500 se reporta con su código, sin confundirse con revocación, y la otra persona sigue visible', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => (id === ANA ? Promise.reject(errorHttp(500)) : Promise.resolve(AGENDA_LUIS)));
    const { result } = renderAgendas([ANA, LUIS]);

    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true), { timeout: 4000 });
    expect(result.current.estados.get(ANA)).toMatchObject({ statusCode: 500, revocada: false });
    expect(result.current.agendas.get(LUIS)).toEqual(AGENDA_LUIS);
  });

  it('mientras carga, la persona no aparece en `agendas` ni se toma como "sin actividad"', async () => {
    let resolver: (agenda: AgendaCompartidaDTO) => void = () => {};
    sharesMock.getAgendaCompartida.mockImplementation(() => new Promise<AgendaCompartidaDTO>((resolve) => (resolver = resolve)));
    const { result } = renderAgendas([ANA]);

    expect(result.current.estados.get(ANA)).toMatchObject({ isLoading: true, isError: false });
    expect(result.current.agendas.size).toBe(0);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolver({ eventos: [], tareas: [] });
    });
    await waitFor(() => expect(result.current.estados.get(ANA)?.isLoading).toBe(false));
    // Ahora sí: cargó y está vacía de verdad.
    expect(result.current.agendas.get(ANA)).toEqual({ eventos: [], tareas: [] });
  });

  it('el reintento individual vuelve a consultar solo a esa persona y, si responde, su agenda aparece', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => (id === ANA ? Promise.reject(errorHttp(403)) : Promise.resolve(AGENDA_LUIS)));
    const { result } = renderAgendas([ANA, LUIS]);
    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true));
    const llamadasLuis = sharesMock.getAgendaCompartida.mock.calls.filter(([id]) => id === LUIS).length;

    sharesMock.getAgendaCompartida.mockImplementation((id: number) => Promise.resolve(id === ANA ? { eventos: [], tareas: [] } : AGENDA_LUIS));
    act(() => {
      result.current.estados.get(ANA)?.refetch();
    });
    await waitFor(() => expect(result.current.agendas.get(ANA)).toEqual({ eventos: [], tareas: [] }));
    expect(result.current.estados.get(ANA)?.isError).toBe(false);
    expect(sharesMock.getAgendaCompartida.mock.calls.filter(([id]) => id === LUIS)).toHaveLength(llamadasLuis);
  });

  it('refetchFallidas reintenta únicamente las que fallaron', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => (id === ANA ? Promise.reject(errorHttp(403)) : Promise.resolve(AGENDA_LUIS)));
    const { result } = renderAgendas([ANA, LUIS]);
    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true));
    sharesMock.getAgendaCompartida.mockClear();
    sharesMock.getAgendaCompartida.mockResolvedValue({ eventos: [], tareas: [] });

    act(() => {
      result.current.refetchFallidas();
    });
    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(false));
    expect(sharesMock.getAgendaCompartida.mock.calls.map(([id]) => id)).toEqual([ANA]);
  });

  it('sin personas activas no consulta nada ni reporta carga o error', () => {
    const { result } = renderAgendas([]);
    expect(result.current.agendas.size).toBe(0);
    expect(result.current.estados.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(sharesMock.getAgendaCompartida).not.toHaveBeenCalled();
  });
});

describe('useAgendasCompartidas — referencias estables (G04-C01, UI-11/UI-12)', () => {
  function renderConProps(ids: number[]) {
    return renderHook(({ ids: actuales, desde, hasta }) => useAgendasCompartidas(actuales, desde, hasta), {
      wrapper,
      initialProps: { ids, desde: DESDE, hasta: HASTA },
    });
  }

  it('volver a renderizar sin datos nuevos devuelve las mismas referencias de `agendas` y `estados` (aunque lleguen arrays y fechas nuevos con el mismo contenido) y no repite peticiones', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => Promise.resolve(id === LUIS ? AGENDA_LUIS : { eventos: [], tareas: [] }));
    const { result, rerender } = renderConProps([ANA, LUIS]);
    await waitFor(() => expect(result.current.agendas.size).toBe(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const antes = result.current;
    const llamadas = sharesMock.getAgendaCompartida.mock.calls.length;

    for (let i = 0; i < 5; i++) rerender({ ids: [ANA, LUIS], desde: new Date(DESDE), hasta: new Date(HASTA) });

    expect(result.current.agendas).toBe(antes.agendas);
    expect(result.current.estados).toBe(antes.estados);
    expect(result.current.erroresPorPropietario).toBe(antes.erroresPorPropietario);
    expect(sharesMock.getAgendaCompartida.mock.calls.length).toBe(llamadas);
  });

  it('un cambio real en la agenda de una persona renueva la colección pero conserva la entrada y el estado de la otra', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => Promise.resolve(id === LUIS ? AGENDA_LUIS : { eventos: [], tareas: [] }));
    const { result } = renderConProps([ANA, LUIS]);
    await waitFor(() => expect(result.current.agendas.size).toBe(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const antes = result.current;

    const nuevaDeAna: AgendaCompartidaDTO = {
      eventos: [{ idEvento: 77, fechaInicio: DESDE.toISOString(), fechaFin: DESDE.toISOString(), visibilidad: 'OCUPADO' }],
      tareas: [],
    };
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => Promise.resolve(id === LUIS ? AGENDA_LUIS : nuevaDeAna));
    act(() => {
      result.current.estados.get(ANA)?.refetch();
    });
    await waitFor(() => expect(result.current.agendas.get(ANA)).toEqual(nuevaDeAna));

    expect(result.current.agendas).not.toBe(antes.agendas);
    expect(result.current.agendas.get(LUIS)).toBe(antes.agendas.get(LUIS));
    expect(result.current.estados.get(LUIS)).toBe(antes.estados.get(LUIS));
  });

  it('un refetch que devuelve exactamente lo mismo no cambia ninguna referencia', async () => {
    sharesMock.getAgendaCompartida.mockImplementation(() => Promise.resolve({ eventos: [...AGENDA_LUIS.eventos], tareas: [] }));
    const { result } = renderConProps([LUIS]);
    await waitFor(() => expect(result.current.agendas.size).toBe(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const antes = result.current;

    await act(async () => {
      result.current.estados.get(LUIS)?.refetch();
    });
    await waitFor(() => expect(sharesMock.getAgendaCompartida).toHaveBeenCalledTimes(2));
    expect(result.current.agendas).toBe(antes.agendas);
    expect(result.current.estados).toBe(antes.estados);
  });

  it('un fallo parcial sigue representado por persona (estado y `erroresPorPropietario`) y también es estable entre renders', async () => {
    const fallo = errorHttp(500);
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => (id === ANA ? Promise.reject(fallo) : Promise.resolve(AGENDA_LUIS)));
    const { result, rerender } = renderConProps([ANA, LUIS]);
    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(result.current.agendas.get(LUIS)).toEqual(AGENDA_LUIS));

    expect(result.current.isError).toBe(true);
    expect(result.current.agendas.has(ANA)).toBe(false);
    expect(result.current.erroresPorPropietario.get(ANA)).toBe(fallo);
    expect(result.current.erroresPorPropietario.has(LUIS)).toBe(false);
    const antes = result.current;
    rerender({ ids: [ANA, LUIS], desde: DESDE, hasta: HASTA });
    expect(result.current.estados).toBe(antes.estados);
    expect(result.current.erroresPorPropietario).toBe(antes.erroresPorPropietario);
  });

  it('activar a otra persona cambia la colección (dependencia real) sin volver a pedir a quien ya estaba', async () => {
    sharesMock.getAgendaCompartida.mockImplementation((id: number) => Promise.resolve(id === LUIS ? AGENDA_LUIS : { eventos: [], tareas: [] }));
    const { result, rerender } = renderConProps([LUIS]);
    await waitFor(() => expect(result.current.agendas.size).toBe(1));
    const deLuis = result.current.agendas.get(LUIS);

    rerender({ ids: [LUIS, ANA], desde: DESDE, hasta: HASTA });
    await waitFor(() => expect(result.current.agendas.size).toBe(2));
    expect(result.current.agendas.get(LUIS)).toBe(deLuis);
    expect(sharesMock.getAgendaCompartida.mock.calls.filter(([id]) => id === LUIS)).toHaveLength(1);
  });
});

/**
 * G05-C05 (UI-11, UI-12, UI-15): lo que faltaba del hook: la lista de
 * comparticiones, las tres mutaciones y su efecto exacto sobre la caché, y la
 * política de reintentos. Un solo QueryClient por caso, sin red ni tiempos reales.
 */
describe('calendarios compartidos — lista, mutaciones y caché (G05-C05)', () => {
  const LISTA = { compartidoPorMi: [], compartidosConmigo: [{ idUsuario: ANA, nombre: 'Ana', apellido: 'García', fotoUrl: null }] };
  const AGENDA_ANA: AgendaCompartidaDTO = { eventos: [], tareas: [] };

  function montar() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
    const envoltorio = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(
      () => ({
        lista: useCalendariosCompartidos(),
        otraLista: useCalendariosCompartidos(),
        agendas: useAgendasCompartidas([ANA, LUIS], DESDE, HASTA),
        compartir: useCompartirCalendario(),
        dejarDeCompartir: useDejarDeCompartirCalendario(),
        dejarDeRecibir: useDejarDeRecibirCalendario(),
      }),
      { wrapper: envoltorio },
    );
    return { client, result };
  }
  const pedidas = (id: number) => sharesMock.getAgendaCompartida.mock.calls.filter(([propietario]) => propietario === id).length;

  async function listo(result: ReturnType<typeof montar>['result']) {
    await waitFor(() => expect(result.current.lista.data).toEqual(LISTA));
    await waitFor(() => expect(result.current.agendas.agendas.size).toBe(2));
  }

  function preparar() {
    sharesMock.getCalendariosCompartidos.mockResolvedValue(LISTA);
    sharesMock.getAgendaCompartida.mockImplementation(async (id: number) => (id === ANA ? AGENDA_ANA : AGENDA_LUIS));
  }

  it('dos consumidores de la lista comparten una sola petición y la misma referencia de datos', async () => {
    preparar();
    const { result } = montar();
    await listo(result);
    expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(1);
    expect(result.current.otraLista.data).toBe(result.current.lista.data);
    expect(calendariosCompartidosQueryKey).toEqual(['calendarios-compartidos']);
  });

  it('compartir invalida solo la lista: se vuelve a pedir una vez y ninguna agenda se recarga', async () => {
    preparar();
    sharesMock.compartirCalendario.mockResolvedValue({ idUsuario: 7, nombre: 'María', apellido: 'López', fotoUrl: null });
    const { result } = montar();
    await listo(result);

    await act(async () => {
      await result.current.compartir.mutateAsync(7);
    });
    expect(sharesMock.compartirCalendario).toHaveBeenCalledWith(7);
    await waitFor(() => expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(2));
    expect(pedidas(ANA)).toBe(1);
    expect(pedidas(LUIS)).toBe(1);
  });

  it('dejar de compartir invalida solo la lista y no toca las agendas que yo recibo', async () => {
    preparar();
    sharesMock.dejarDeCompartirCalendario.mockResolvedValue({ eliminado: true });
    const { client, result } = montar();
    await listo(result);

    await act(async () => {
      await result.current.dejarDeCompartir.mutateAsync(7);
    });
    expect(sharesMock.dejarDeCompartirCalendario).toHaveBeenCalledWith(7);
    await waitFor(() => expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(2));
    expect(pedidas(ANA) + pedidas(LUIS)).toBe(2);
    expect(client.getQueryCache().findAll({ queryKey: ['agenda-compartida'] })).toHaveLength(2);
  });

  it('quitarme el calendario de una persona descarta de la caché solo SU agenda, refresca la lista y no recarga la de la otra', async () => {
    preparar();
    sharesMock.dejarDeRecibirCalendario.mockResolvedValue({ eliminado: true });
    const { client, result } = montar();
    await listo(result);
    const estadoLuis = result.current.agendas.estados.get(LUIS);
    const agendaLuis = result.current.agendas.agendas.get(LUIS);
    // Tras quitarla, el servidor ya no deja leer la agenda de Ana.
    sharesMock.getAgendaCompartida.mockImplementation(async (id: number) => (id === ANA ? Promise.reject(errorHttp(403)) : AGENDA_LUIS));

    await act(async () => {
      await result.current.dejarDeRecibir.mutateAsync(ANA);
    });
    expect(sharesMock.dejarDeRecibirCalendario).toHaveBeenCalledWith(ANA);
    await waitFor(() => expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(2));
    // Lo cacheado de Ana ya no está disponible: nunca se sirve una agenda para la que perdí el permiso.
    await waitFor(() => expect(result.current.agendas.agendas.has(ANA)).toBe(false));
    expect(client.getQueryData(['agenda-compartida', ANA, DESDE.toISOString(), HASTA.toISOString()])).toBeUndefined();
    // Luis: misma agenda, mismo estado, ni una petición más.
    expect(result.current.agendas.agendas.get(LUIS)).toBe(agendaLuis);
    expect(result.current.agendas.estados.get(LUIS)).toBe(estadoLuis);
    expect(pedidas(LUIS)).toBe(1);
    expect(client.getQueryData(['agenda-compartida', LUIS, DESDE.toISOString(), HASTA.toISOString()])).toEqual(AGENDA_LUIS);
  });

  it.each([
    ['compartir', 'compartirCalendario', 409],
    ['dejarDeCompartir', 'dejarDeCompartirCalendario', 500],
    ['dejarDeRecibir', 'dejarDeRecibirCalendario', 500],
  ] as const)('si %s falla no se invalida ni se descarta nada y el error llega a quien llamó', async (hook, servicio, codigo) => {
    preparar();
    sharesMock[servicio].mockRejectedValue(errorHttp(codigo));
    const { client, result } = montar();
    await listo(result);

    await act(async () => {
      await expect(result.current[hook].mutateAsync(ANA)).rejects.toMatchObject({ statusCode: codigo });
    });
    await waitFor(() => expect(result.current[hook].isError).toBe(true));
    expect(sharesMock.getCalendariosCompartidos).toHaveBeenCalledTimes(1);
    expect(pedidas(ANA) + pedidas(LUIS)).toBe(2);
    expect(client.getQueryData(['agenda-compartida', ANA, DESDE.toISOString(), HASTA.toISOString()])).toEqual(AGENDA_ANA);
    expect(result.current.agendas.agendas.size).toBe(2);
  });

  it('si la lista falla, el error se expone con su código y las agendas ya activas no se ven afectadas', async () => {
    sharesMock.getCalendariosCompartidos.mockRejectedValue(errorHttp(500));
    sharesMock.getAgendaCompartida.mockResolvedValue(AGENDA_LUIS);
    const { result } = montar();
    await waitFor(() => expect(result.current.lista.isError).toBe(true));
    expect(result.current.lista.error).toMatchObject({ statusCode: 500 });
    expect(result.current.lista.data).toBeUndefined();
    await waitFor(() => expect(result.current.agendas.agendas.size).toBe(2));
    expect(result.current.agendas.isError).toBe(false);
  });
});

describe('useAgendasCompartidas — reintentos y claves de caché (G05-C05)', () => {
  it.each([
    [403, 1, 'la persona dejó de compartir: no se insiste'],
    [500, 2, 'fallo del servidor: un reintento'],
    [0, 2, 'sin red (sin código): un reintento'],
    [401, 2, 'sesión caducada: un reintento y luego se reporta'],
  ])('un error %i hace %i petición(es) en total (%s)', async (codigo, peticiones) => {
    sharesMock.getAgendaCompartida.mockRejectedValue(codigo === 0 ? new Error('Network Error') : errorHttp(codigo));
    const { result } = renderAgendas([ANA]);
    await waitFor(() => expect(result.current.estados.get(ANA)?.isError).toBe(true));
    expect(sharesMock.getAgendaCompartida).toHaveBeenCalledTimes(peticiones);
    expect(result.current.estados.get(ANA)).toMatchObject({ revocada: codigo === 403, statusCode: codigo === 0 ? undefined : codigo });
    expect(result.current.erroresPorPropietario.has(ANA)).toBe(true);
  });

  it('cada persona y cada rango tienen su propia clave: cambiar de periodo pide el nuevo rango con las fechas exactas', async () => {
    sharesMock.getAgendaCompartida.mockResolvedValue(AGENDA_LUIS);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const envoltorio = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const SIGUIENTE = new Date(2026, 9, 19);
    const { result, rerender } = renderHook(({ desde, hasta }) => useAgendasCompartidas([ANA, LUIS], desde, hasta), {
      wrapper: envoltorio,
      initialProps: { desde: DESDE, hasta: HASTA },
    });
    await waitFor(() => expect(result.current.agendas.size).toBe(2));
    rerender({ desde: HASTA, hasta: SIGUIENTE });
    await waitFor(() => expect(sharesMock.getAgendaCompartida).toHaveBeenCalledTimes(4));

    const claves = client.getQueryCache().findAll({ queryKey: ['agenda-compartida'] }).map((q) => q.queryKey.join('|')).sort();
    expect(claves).toEqual(
      [ANA, LUIS].flatMap((id) => [`agenda-compartida|${id}|${DESDE.toISOString()}|${HASTA.toISOString()}`, `agenda-compartida|${id}|${HASTA.toISOString()}|${SIGUIENTE.toISOString()}`]).sort(),
    );
    const ultimas = sharesMock.getAgendaCompartida.mock.calls.slice(2);
    for (const [, desde, hasta] of ultimas) {
      expect((desde as Date).toISOString()).toBe(HASTA.toISOString());
      expect((hasta as Date).toISOString()).toBe(SIGUIENTE.toISOString());
    }
  });

  it('desactivar a una persona la saca de las colecciones sin pedir nada y sin tocar a la que sigue activa', async () => {
    sharesMock.getAgendaCompartida.mockImplementation(async (id: number) => (id === ANA ? { eventos: [], tareas: [] } : AGENDA_LUIS));
    const { result, rerender } = renderHook(({ ids }) => useAgendasCompartidas(ids, DESDE, HASTA), { wrapper, initialProps: { ids: [ANA, LUIS] } });
    await waitFor(() => expect(result.current.agendas.size).toBe(2));
    const agendaLuis = result.current.agendas.get(LUIS);

    rerender({ ids: [LUIS] });
    await waitFor(() => expect(result.current.agendas.size).toBe(1));
    expect([...result.current.estados.keys()]).toEqual([LUIS]);
    expect(result.current.agendas.get(LUIS)).toBe(agendaLuis);
    expect(sharesMock.getAgendaCompartida).toHaveBeenCalledTimes(2);
  });
});
