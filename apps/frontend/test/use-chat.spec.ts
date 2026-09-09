import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const emitWithAck = vi.fn().mockResolvedValue({ joined: true });
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
    emit: vi.fn(),
    emitWithAck,
    timeout: vi.fn(() => ({ emitWithAck })),
    __emit: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
  return socket;
}

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

import { useChatSocket } from '../hooks/use-chat';
import { conversationMessagesQueryKey, projectConversationsQueryKey } from '../lib/query-keys/chat';
import type { ChatMensaje } from '../lib/types/chat';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const mensaje: ChatMensaje = {
  idMensaje: 1,
  idConversacion: 5,
  contenido: 'hola',
  enviadoEn: new Date().toISOString(),
  remitente: { idUsuario: 2, nombre: 'A', apellido: 'B', fotoUrl: null },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useChatSocket — join de conversación', () => {
  it('al abrir una conversación, emite joinConversation con ack (no fire-and-forget)', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();

    renderHook(({ activeId }) => useChatSocket(1, activeId), { wrapper, initialProps: { activeId: 5 } });

    await waitFor(() => expect(socket.timeout).toHaveBeenCalledWith(3000));
    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledWith('joinConversation', { idConversacion: 5 }));
  });

  it('si el ack indica joined:false, reintenta hasta que el gateway confirme la unión', async () => {
    const socket = createMockSocket();
    socket.emitWithAck
      .mockResolvedValueOnce({ joined: false })
      .mockResolvedValueOnce({ joined: false })
      .mockResolvedValueOnce({ joined: true });
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();

    renderHook(({ activeId }) => useChatSocket(1, activeId), { wrapper, initialProps: { activeId: 5 } });

    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledTimes(3), { timeout: 3000 });
  });

  it('al reconectar (evento connect) re-emite joinConversation para la conversación activa', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    renderHook(({ activeId }) => useChatSocket(1, activeId), { wrapper, initialProps: { activeId: 5 } });

    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledTimes(1));

    act(() => {
      socket.__emit('connect');
    });

    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledTimes(2));
  });
});

describe('useChatSocket — newMessage sin actualizar cache en silencio', () => {
  it('con la cache de mensajes ya poblada, anexa el mensaje nuevo', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(conversationMessagesQueryKey(1, 5), [] as ChatMensaje[]);

    renderHook(({ activeId }) => useChatSocket(1, activeId), { wrapper, initialProps: { activeId: 5 } });

    act(() => {
      socket.__emit('newMessage', { idConversacion: 5, mensaje });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(conversationMessagesQueryKey(1, 5))).toEqual([mensaje]),
    );
  });

  it('sin cache previa para esa conversación, no descarta el mensaje: fuerza un refetch de esa conversación', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(({ activeId }) => useChatSocket(1, activeId), { wrapper, initialProps: { activeId: 5 } });

    act(() => {
      socket.__emit('newMessage', { idConversacion: 5, mensaje });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationMessagesQueryKey(1, 5) }),
    );
    expect(queryClient.getQueryData(conversationMessagesQueryKey(1, 5))).toBeUndefined();
  });
});

describe('useChatSocket — conversationUpdated', () => {
  it('invalida la lista de conversaciones del proyecto', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useChatSocket(1, null), { wrapper });

    act(() => {
      socket.__emit('conversationUpdated', { idConversacion: 5 });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectConversationsQueryKey(1) }),
    );
  });
});
