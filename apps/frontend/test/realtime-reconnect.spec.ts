import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const emitWithAck = vi.fn().mockResolvedValue({ joined: true });
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn(),
    close: vi.fn(),
    connect: vi.fn(),
    emit: vi.fn(),
    emitWithAck,
    timeout: vi.fn(() => ({ emitWithAck })),
    __emit: (event: string, ...args: unknown[]) => {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
}
const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
const mockRefresh = vi.fn();
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  refreshSession: () => mockRefresh(),
}));

import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import { useGlobalChatSocket } from '../hooks/use-chat';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
}

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * El backend cierra el socket al vencer el access token (motivo
 * 'io server disconnect'); el cliente debe reconectar con la cookie renovada
 * en vez de quedarse sin tiempo real. No reconecta si el handshake nunca se
 * autenticó (rechazo) ni ante otros motivos, para no entrar en bucle.
 */
describe.each([
  ['useRealtimeNotifications', () => renderHook(() => useRealtimeNotifications(true), { wrapper })],
  ['useGlobalChatSocket', () => renderHook(() => useGlobalChatSocket([]), { wrapper })],
])('%s: reconexión tras cierre del servidor', (_nombre, render) => {
  it("renueva la sesión y reconecta ante 'io server disconnect' tras haberse autenticado", async () => {
    mockRefresh.mockResolvedValue(true);
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    render();

    socket.__emit('connected', { userId: 7 });
    socket.__emit('disconnect', 'io server disconnect');
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('no reconecta si la sesión no se pudo renovar (la cookie venció)', async () => {
    mockRefresh.mockResolvedValue(false);
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    render();

    socket.__emit('connected', { userId: 7 });
    socket.__emit('disconnect', 'io server disconnect');
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('no reconecta si el hook se desmonta mientras se renueva la sesión', async () => {
    let resolver: (ok: boolean) => void = () => {};
    mockRefresh.mockReturnValue(new Promise<boolean>((r) => { resolver = r; }));
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { unmount } = render();

    socket.__emit('connected', { userId: 7 });
    socket.__emit('disconnect', 'io server disconnect');
    unmount();
    resolver(true);
    await Promise.resolve();
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('no reconecta si el handshake nunca se autenticó (evita bucle ante rechazo)', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    render();

    socket.__emit('disconnect', 'io server disconnect');

    expect(socket.connect).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it.each(['transport close', 'ping timeout', 'io client disconnect'])('no reconecta a mano ante %s (lo gestiona socket.io)', (motivo) => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    render();

    socket.__emit('connected', { userId: 7 });
    socket.__emit('disconnect', motivo);

    expect(socket.connect).not.toHaveBeenCalled();
  });
});
