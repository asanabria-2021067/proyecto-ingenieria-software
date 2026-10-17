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

const toggleSavedMock = vi.hoisted(() => vi.fn());
const listSavedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({
  toggleSavedMessage: (...args: unknown[]) => toggleSavedMock(...args),
  listSavedMessages: (...args: unknown[]) => listSavedMock(...args),
}));

import { useGlobalChatSocket, useSavedMessages, useToggleSavedMessage } from '../hooks/use-chat';
import { conversationMessagesQueryKey } from '../lib/query-keys/chat';
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

describe('mensajes guardados', () => {
  it('useToggleSavedMessage actualiza guardado en la cache del historial e invalida la lista de guardados', async () => {
    toggleSavedMock.mockResolvedValue({ guardado: true });
    const { queryClient, wrapper } = createWrapper();
    const key = conversationMessagesQueryKey(10, 5);
    queryClient.setQueryData<ChatMensaje[]>(key, [mensaje, { ...mensaje, idMensaje: 2 }]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleSavedMessage(10, 5), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(toggleSavedMock).toHaveBeenCalledWith(10, 5, 1);
    expect(queryClient.getQueryData<ChatMensaje[]>(key)?.map((m) => m.guardado)).toEqual([true, undefined]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chats-guardados'] });
  });

  it('useToggleSavedMessage sin cache del historial no revienta', async () => {
    toggleSavedMock.mockResolvedValue({ guardado: false });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleSavedMessage(10, 5), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(toggleSavedMock).toHaveBeenCalledTimes(1);
  });

  it('useSavedMessages pagina con hasMore y no consulta si esta deshabilitado', async () => {
    const item = { idMensaje: 1, contenido: 'x' };
    listSavedMock.mockResolvedValueOnce({ items: [item], hasMore: true }).mockResolvedValueOnce({ items: [{ ...item, idMensaje: 2 }], hasMore: false });
    const { wrapper } = createWrapper();

    const apagado = renderHook(() => useSavedMessages(false), { wrapper });
    expect(apagado.result.current.guardados).toEqual([]);
    expect(listSavedMock).not.toHaveBeenCalled();
    apagado.unmount();

    const { result } = renderHook(() => useSavedMessages(true), { wrapper });
    await waitFor(() => expect(result.current.guardados).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.cargarMas();
    });
    await waitFor(() => expect(result.current.guardados).toHaveLength(2));
    expect(listSavedMock).toHaveBeenLastCalledWith(2);
    expect(result.current.hasMore).toBe(false);
  });
});
