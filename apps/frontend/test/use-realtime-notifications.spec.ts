import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const socket = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    close: vi.fn(),
    __emit: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    __handlerCount: (event: string) => handlers.get(event)?.size ?? 0,
  };
  return socket;
}

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import { projectSprintsQueryKey } from '../lib/query-keys/sprints';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useRealtimeNotifications — deshabilitado', () => {
  it('con enabled=false, no crea ningún socket', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useRealtimeNotifications(false), { wrapper });

    expect(mockIo).not.toHaveBeenCalled();
  });
});

describe('useRealtimeNotifications — evento "notification" existente (regresión)', () => {
  it('sigue actualizando latestNotification sin que F6 lo haya afectado', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRealtimeNotifications(true), { wrapper });

    act(() => {
      socket.__emit('notification', { tipoNotificacion: 'X', tituloNotificacion: 'Hola' });
    });

    await waitFor(() =>
      expect(result.current.latestNotification).toEqual({
        tipoNotificacion: 'X',
        tituloNotificacion: 'Hola',
      }),
    );
  });

  it('connect/disconnect siguen actualizando isConnected', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRealtimeNotifications(true), { wrapper });

    act(() => {
      socket.__emit('connect');
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      socket.__emit('disconnect');
    });
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });
});

describe('useRealtimeNotifications — SPRINT_FINALIZATION_STARTED (F6 START)', () => {
  it('invalida exactamente project-sprints del proyecto real del payload (projectId, no idProyecto)', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_FINALIZATION_STARTED', { projectId: 42, sprintId: 1 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(42) }),
    );
  });

  it('un evento de otro proyecto invalida SOLO la key de ESE proyecto, nunca una key distinta/actual hardcodeada', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_FINALIZATION_STARTED', { projectId: 17, sprintId: 9 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(17) }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(42) });
  });
});

describe('useRealtimeNotifications — SPRINT_CLOSED (F6 CLOSE, A9.1)', () => {
  it('invalida exactamente project-sprints del proyecto real del payload', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_CLOSED', { projectId: 42, sprintId: 1 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(42) }),
    );
  });

  it('un cierre de otro proyecto invalida solo la key de ese proyecto', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_CLOSED', { projectId: 17, sprintId: 9 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(17) }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(42) });
  });

  it('no invalida indiscriminadamente otras caches (tasks/members)', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_CLOSED', { projectId: 42, sprintId: 1 });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-tasks', 42] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-equipo', 42] });
  });
});

describe('useRealtimeNotifications — cleanup', () => {
  it('al desmontar, desregistra cada handler (mismo objeto función registrado en .on) y cierra el socket', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useRealtimeNotifications(true), { wrapper });

    const onCalls = socket.on.mock.calls as [string, (...a: unknown[]) => void][];
    expect(onCalls.length).toBeGreaterThan(0);

    unmount();

    const offCalls = socket.off.mock.calls as [string, (...a: unknown[]) => void][];
    // Cada evento registrado con .on debe desregistrarse en .off con la
    // MISMA referencia de función — nunca una función anónima distinta que
    // dejaría el listener original activo.
    for (const [event, handler] of onCalls) {
      expect(offCalls).toContainEqual([event, handler]);
    }
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('tras el cleanup, ningún handler queda registrado en el socket', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useRealtimeNotifications(true), { wrapper });

    expect(socket.__handlerCount('SPRINT_FINALIZATION_STARTED')).toBeGreaterThan(0);
    unmount();
    expect(socket.__handlerCount('SPRINT_FINALIZATION_STARTED')).toBe(0);
    expect(socket.__handlerCount('SPRINT_CLOSED')).toBe(0);
    expect(socket.__handlerCount('notification')).toBe(0);
  });
});

describe('useRealtimeNotifications — sin listeners duplicados', () => {
  it('un re-render con el mismo enabled no vuelve a conectar ni a registrar handlers otra vez', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { rerender } = renderHook(({ enabled }) => useRealtimeNotifications(enabled), {
      wrapper,
      initialProps: { enabled: true },
    });

    const registrosIniciales = socket.on.mock.calls.length;
    expect(mockIo).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });

    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(socket.on.mock.calls.length).toBe(registrosIniciales);
  });

  it('un cambio real de enabled sí desconecta el socket anterior y conecta uno nuevo (remount legítimo, no leak)', () => {
    const socketA = createMockSocket();
    mockIo.mockReturnValueOnce(socketA);
    const { wrapper } = createWrapper();
    const { rerender } = renderHook(({ enabled }) => useRealtimeNotifications(enabled), {
      wrapper,
      initialProps: { enabled: false },
    });

    rerender({ enabled: true });

    expect(mockIo).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });

    expect(socketA.close).toHaveBeenCalledTimes(1);
  });
});
