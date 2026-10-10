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

import { useAgendasCompartidas } from '../hooks/use-calendar-shares';
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
