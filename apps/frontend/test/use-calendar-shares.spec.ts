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
