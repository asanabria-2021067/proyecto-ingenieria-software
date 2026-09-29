import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

import { useChatSocket } from '../hooks/use-chat';

/**
 * G07-C06 · P2/T12 (HU-159). El chat sigue el mismo contrato que las
 * notificaciones: NEXT_PUBLIC_API_URL horneada vacía → origen de la página
 * (nunca una IP ni :3001); URL explícita → comportamiento previo a P4.
 */

const IPV4 = /\b\d{1,3}(\.\d{1,3}){3}\b/;

function fakeSocket() {
  const emitWithAck = vi.fn().mockResolvedValue({ joined: true });
  return { on: vi.fn(), off: vi.fn(), close: vi.fn(), emit: vi.fn(), emitWithAck, timeout: vi.fn(() => ({ emitWithAck })) };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('T12: useChatSocket', () => {
  it('same-origin: conecta /chat en el origen de la página, con la cookie de sesión', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    mockIo.mockReturnValue(fakeSocket());

    renderHook(() => useChatSocket(4, null), { wrapper });

    const [url, options] = mockIo.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/chat`);
    expect(url).not.toContain(':3001');
    expect(url).not.toMatch(IPV4);
    expect(options).toMatchObject({ withCredentials: true, transports: ['websocket', 'polling'] });
  });

  it('legacy: con NEXT_PUBLIC_API_URL explícita sigue usando esa URL con ws/wss', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://158.23.57.118:3001');
    mockIo.mockReturnValue(fakeSocket());

    renderHook(() => useChatSocket(4, null), { wrapper });

    expect(mockIo.mock.calls[0][0]).toBe('ws://158.23.57.118:3001/chat');
  });

  it('notificaciones y chat resuelven la misma base (un solo contrato)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    mockIo.mockReturnValue(fakeSocket());
    const { useRealtimeNotifications } = await import('../lib/hooks/useRealtimeNotifications');

    renderHook(() => useChatSocket(4, null), { wrapper });
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    const bases = mockIo.mock.calls.map(([url]) => String(url).replace(/\/(chat|notifications)$/, ''));
    expect(new Set(bases)).toEqual(new Set([window.location.origin]));
  });
});
