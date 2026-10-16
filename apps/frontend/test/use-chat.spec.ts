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

const mockToggleReaction = vi.fn();
vi.mock('../lib/services/chat', () => ({
  toggleReaction: (...args: unknown[]) => mockToggleReaction(...args),
}));

import { TYPING_EXPIRY_MS, TYPING_THROTTLE_MS, useGlobalChatSocket, useToggleReaction } from '../hooks/use-chat';
import { conversationMessagesQueryKey, conversationReadsQueryKey } from '../lib/query-keys/chat';
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

describe('useGlobalChatSocket — join de ventanas abiertas', () => {
  it('al abrir una ventana de chat, emite joinConversation con ack (no fire-and-forget)', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();

    renderHook(({ ids }) => useGlobalChatSocket(ids), { wrapper, initialProps: { ids: [5] } });

    await waitFor(() => expect(socket.timeout).toHaveBeenCalledWith(3000));
    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledWith('joinConversation', { idConversacion: 5 }));
  });

  it('al cerrar una ventana, emite leaveConversation', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();

    const { rerender } = renderHook(({ ids }) => useGlobalChatSocket(ids), {
      wrapper,
      initialProps: { ids: [5] },
    });
    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledWith('joinConversation', { idConversacion: 5 }));

    rerender({ ids: [] });

    await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('leaveConversation', { idConversacion: 5 }));
  });

  it('al reconectar (evento connect) re-emite joinConversation para las ventanas abiertas', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    renderHook(({ ids }) => useGlobalChatSocket(ids), { wrapper, initialProps: { ids: [5] } });

    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalled());
    socket.emitWithAck.mockClear();

    act(() => {
      socket.__emit('connect');
    });

    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledWith('joinConversation', { idConversacion: 5 }));
  });

  it('T-333: al reconectar, invalida la lista global y los mensajes de las ventanas abiertas', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(({ ids }) => useGlobalChatSocket(ids), { wrapper, initialProps: { ids: [5] } });
    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalled());
    invalidateSpy.mockClear();

    act(() => {
      socket.__emit('connect');
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chats-global'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) }));
  });

  it('expone isConnected: true tras el evento connect', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();

    const { result } = renderHook(({ ids }) => useGlobalChatSocket(ids), {
      wrapper,
      initialProps: { ids: [] as number[] },
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      socket.__emit('connect');
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
  });
});

describe('useGlobalChatSocket — newMessage sin actualizar cache en silencio', () => {
  it('con la cache de mensajes ya poblada, anexa el mensaje nuevo', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(conversationMessagesQueryKey(1, 5), [] as ChatMensaje[]);

    renderHook(({ ids }) => useGlobalChatSocket(ids), { wrapper, initialProps: { ids: [5] } });

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

    renderHook(({ ids }) => useGlobalChatSocket(ids), { wrapper, initialProps: { ids: [5] } });

    act(() => {
      socket.__emit('newMessage', { idConversacion: 5, mensaje });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) })));
    expect(queryClient.getQueryData(conversationMessagesQueryKey(1, 5))).toBeUndefined();
  });
});

describe('useGlobalChatSocket — conversationUpdated', () => {
  it('invalida la lista global y las listas por proyecto', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useGlobalChatSocket([]), { wrapper });

    act(() => {
      socket.__emit('conversationUpdated', { idConversacion: 5 });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chats-global'] }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['proyecto-conversaciones'] });
  });
});

describe('useGlobalChatSocket - escribiendo y visto por', () => {
  it('typing: marca a la persona como escribiendo y expira solo a los 4 s', () => {
    vi.useFakeTimers();
    try {
      const socket = createMockSocket();
      mockIo.mockReturnValue(socket);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useGlobalChatSocket([]), { wrapper });

      act(() => socket.__emit('typing', { idConversacion: 5, idUsuario: 2 }));
      expect(result.current.typingByConversation[5]).toEqual([2]);

      act(() => vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1));
      expect(result.current.typingByConversation[5]).toEqual([2]);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.typingByConversation[5]).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('typing repetido reinicia la expiracion y no duplica a la persona', () => {
    vi.useFakeTimers();
    try {
      const socket = createMockSocket();
      mockIo.mockReturnValue(socket);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useGlobalChatSocket([]), { wrapper });

      act(() => socket.__emit('typing', { idConversacion: 5, idUsuario: 2 }));
      act(() => vi.advanceTimersByTime(3000));
      act(() => socket.__emit('typing', { idConversacion: 5, idUsuario: 2 }));
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.typingByConversation[5]).toEqual([2]);
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.typingByConversation[5]).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('newMessage del que escribia limpia el indicador de inmediato', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGlobalChatSocket([]), { wrapper });

    act(() => socket.__emit('typing', { idConversacion: 5, idUsuario: 2 }));
    act(() => socket.__emit('newMessage', { idConversacion: 5, mensaje }));

    expect(result.current.typingByConversation[5]).toEqual([]);
  });

  it('emitTyping respeta el throttle por conversacion', () => {
    const now = vi.spyOn(Date, 'now');
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGlobalChatSocket([]), { wrapper });

    now.mockReturnValue(100000);
    result.current.emitTyping(5);
    now.mockReturnValue(100000 + TYPING_THROTTLE_MS - 1);
    result.current.emitTyping(5);
    result.current.emitTyping(6);
    now.mockReturnValue(100000 + TYPING_THROTTLE_MS);
    result.current.emitTyping(5);
    now.mockRestore();

    const typingEmits = socket.emit.mock.calls.filter(([evento]) => evento === 'typing');
    expect(typingEmits).toEqual([
      ['typing', { idConversacion: 5 }],
      ['typing', { idConversacion: 6 }],
      ['typing', { idConversacion: 5 }],
    ]);
  });

  it('messagesRead actualiza la lectura de esa persona en la cache de lecturas', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(conversationReadsQueryKey(10, 5), [
      { idUsuario: 2, ultimaLecturaEn: null },
      { idUsuario: 3, ultimaLecturaEn: '2026-10-16T09:00:00Z' },
    ]);
    renderHook(() => useGlobalChatSocket([]), { wrapper });

    act(() => socket.__emit('messagesRead', { idConversacion: 5, idUsuario: 2, ultimaLecturaEn: '2026-10-16T10:00:00Z' }));

    expect(queryClient.getQueryData(conversationReadsQueryKey(10, 5))).toEqual([
      { idUsuario: 3, ultimaLecturaEn: '2026-10-16T09:00:00Z' },
      { idUsuario: 2, ultimaLecturaEn: '2026-10-16T10:00:00Z' },
    ]);
  });

  it('messagesRead sin cache de lecturas no crea nada', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    renderHook(() => useGlobalChatSocket([]), { wrapper });

    act(() => socket.__emit('messagesRead', { idConversacion: 5, idUsuario: 2, ultimaLecturaEn: '2026-10-16T10:00:00Z' }));

    expect(queryClient.getQueryData(conversationReadsQueryKey(10, 5))).toBeUndefined();
  });
});

describe('useGlobalChatSocket - reactionUpdated', () => {
  it('reemplaza las reacciones del mensaje y deriva reaccionadoPorMi del usuario actual', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['currentUser'], { idUsuario: 7 });
    queryClient.setQueryData(conversationMessagesQueryKey(1, 5), [mensaje, { ...mensaje, idMensaje: 2 }]);

    renderHook(() => useGlobalChatSocket([5]), { wrapper });

    act(() => {
      socket.__emit('reactionUpdated', {
        idConversacion: 5,
        idMensaje: 1,
        reacciones: [{ emoji: 'X', count: 2, idsUsuarios: [7, 8] }],
      });
    });

    await waitFor(() => {
      const [primero, segundo] = queryClient.getQueryData(conversationMessagesQueryKey(1, 5)) as ChatMensaje[];
      expect(primero.reacciones).toEqual([{ emoji: 'X', count: 2, reaccionadoPorMi: true }]);
      expect(segundo.reacciones).toBeUndefined();
    });
  });

  it('ignora el evento si la conversacion no esta en cache', () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useGlobalChatSocket([]), { wrapper });
    act(() => {
      socket.__emit('reactionUpdated', { idConversacion: 9, idMensaje: 1, reacciones: [] });
    });

    expect(queryClient.getQueryData(conversationMessagesQueryKey(1, 9))).toBeUndefined();
  });
});

describe('useToggleReaction', () => {
  const clave = conversationMessagesQueryKey(1, 5);

  it('aplica la reaccion de forma optimista y luego la reemplaza con la respuesta del servidor', async () => {
    let resolver!: (v: unknown) => void;
    mockToggleReaction.mockReturnValue(new Promise((r) => (resolver = r)));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(clave, [mensaje]);

    const { result } = renderHook(() => useToggleReaction(1, 5), { wrapper });
    act(() => {
      result.current.mutate({ idMensaje: 1, emoji: 'X' });
    });

    await waitFor(() =>
      expect((queryClient.getQueryData(clave) as ChatMensaje[])[0].reacciones).toEqual([
        { emoji: 'X', count: 1, reaccionadoPorMi: true },
      ]),
    );

    resolver([{ emoji: 'X', count: 3, reaccionadoPorMi: true }]);
    await waitFor(() =>
      expect((queryClient.getQueryData(clave) as ChatMensaje[])[0].reacciones).toEqual([
        { emoji: 'X', count: 3, reaccionadoPorMi: true },
      ]),
    );
    expect(mockToggleReaction).toHaveBeenCalledWith(1, 5, 1, 'X');
  });

  it('si el servidor falla, revierte al estado previo', async () => {
    mockToggleReaction.mockRejectedValue(new Error('403'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(clave, [mensaje]);

    const { result } = renderHook(() => useToggleReaction(1, 5), { wrapper });
    act(() => {
      result.current.mutate({ idMensaje: 1, emoji: 'X' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(clave)).toEqual([mensaje]);
  });
});
