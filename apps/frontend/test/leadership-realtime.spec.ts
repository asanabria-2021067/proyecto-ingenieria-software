import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn(),
    close: vi.fn(),
    __emit: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}
const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import {
  leadershipAppealsPrefix,
  leadershipAppealsQueryKey,
  leadershipCandidatesQueryKey,
  leadershipContextQueryKey,
  leadershipHistoryPrefix,
  leadershipHistoryQueryKey,
} from '../lib/query-keys/leadership';
import { projectDetailQueryKey } from '../lib/query-keys/project';
import { projectAllPostulationsQueryKey } from '../lib/query-keys/applications';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useRealtimeNotifications — LEADERSHIP_CHANGED (F008)', () => {
  const payload = { projectId: 42, historialId: 3, liderAnteriorId: 1, liderNuevoId: 8, origen: 'CAMBIO_ADMINISTRATIVO' };

  it('invalida las 4 keys de liderazgo Y el detalle del proyecto', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('LEADERSHIP_CHANGED', payload);

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipContextQueryKey(42) }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipCandidatesQueryKey(42) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipHistoryPrefix(42) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipAppealsPrefix(42) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectDetailQueryKey(42) });
    // los prefijos alcanzan cualquier página/filtro
    expect(leadershipHistoryQueryKey(42, 3).slice(0, 2)).toEqual([...leadershipHistoryPrefix(42)]);
    expect(leadershipAppealsQueryKey(42, 'PENDIENTE', 2).slice(0, 2)).toEqual([...leadershipAppealsPrefix(42)]);
  });

  it('no deriva ningún permiso ni estado del payload: la caché queda vacía hasta reconsultar', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(leadershipContextQueryKey(42), { liderActual: { idUsuario: 1 } });
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('LEADERSHIP_CHANGED', payload);

    await waitFor(() => expect(queryClient.getQueryState(leadershipContextQueryKey(42))?.isInvalidated).toBe(true));
    // El dato en caché NO se reescribe con `liderNuevoId`: sigue siendo el anterior hasta que el servidor responda.
    expect((queryClient.getQueryData(leadershipContextQueryKey(42)) as any).liderActual.idUsuario).toBe(1);
    expect(queryClient.getQueryData(projectDetailQueryKey(42))).toBeUndefined();
  });

  it('un evento de otro proyecto no invalida las keys de este', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('LEADERSHIP_CHANGED', { ...payload, projectId: 17 });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipContextQueryKey(17) }));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: leadershipContextQueryKey(42) });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectDetailQueryKey(42) });
  });

  it('projectAllPostulationsQueryKey conserva exactamente el array literal previo', () => {
    expect(projectAllPostulationsQueryKey('42')).toEqual(['postulaciones-proyecto', '42']);
  });
});
