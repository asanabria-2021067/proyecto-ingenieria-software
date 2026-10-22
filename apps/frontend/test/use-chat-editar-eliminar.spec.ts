import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const emitWithAck = vi.fn().mockResolvedValue({ joined: true });
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
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
}

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

const editMessageMock = vi.fn();
const deleteMessageMock = vi.fn();
vi.mock('@/lib/services/chat', () => ({
  editMessage: (...args: unknown[]) => editMessageMock(...args),
  deleteMessage: (...args: unknown[]) => deleteMessageMock(...args),
}));

import { useDeleteMessage, useEditMessage, useGlobalChatSocket } from '../hooks/use-chat';
import { conversationMessagesQueryKey } from '../lib/query-keys/chat';
import type { ChatMensaje } from '../lib/types/chat';

const remitente = { idUsuario: 1, nombre: 'A', apellido: 'B', fotoUrl: null };
const original: ChatMensaje = {
  idMensaje: 1,
  idConversacion: 5,
  contenido: 'hola',
  enviadoEn: '2026-10-16T10:00:00.000Z',
  remitente,
};
const otro: ChatMensaje = { ...original, idMensaje: 2, contenido: 'otro' };
const llave = conversationMessagesQueryKey(10, 5);

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData<ChatMensaje[]>(llave, [original, otro]);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useEditMessage / useDeleteMessage', () => {
  it('useEditMessage llama al servicio y reemplaza solo ese mensaje en la cache', async () => {
    const { queryClient, wrapper } = setup();
    const editado = { ...original, contenido: 'nuevo', editadoEn: '2026-10-16T10:05:00.000Z' };
    editMessageMock.mockResolvedValue(editado);

    const { result } = renderHook(() => useEditMessage(10, 5), { wrapper });
    await act(() => result.current.mutateAsync({ idMensaje: 1, contenido: 'nuevo' }));

    expect(editMessageMock).toHaveBeenCalledWith(10, 5, 1, 'nuevo');
    expect(queryClient.getQueryData(llave)).toEqual([editado, otro]);
  });

  it('useDeleteMessage llama al servicio y deja el mensaje eliminado en la cache', async () => {
    const { queryClient, wrapper } = setup();
    const eliminado = { ...original, contenido: '', eliminadoEn: '2026-10-16T10:10:00.000Z' };
    deleteMessageMock.mockResolvedValue(eliminado);

    const { result } = renderHook(() => useDeleteMessage(10, 5), { wrapper });
    await act(() => result.current.mutateAsync(1));

    expect(deleteMessageMock).toHaveBeenCalledWith(10, 5, 1);
    expect(queryClient.getQueryData(llave)).toEqual([eliminado, otro]);
  });
});

describe('useGlobalChatSocket - messageUpdated y messageDeleted', () => {
  it.each(['messageUpdated', 'messageDeleted'])('%s reemplaza el mensaje en la cache sin refetch', async (evento) => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { queryClient, wrapper } = setup();
    renderHook(() => useGlobalChatSocket([5]), { wrapper });
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith(evento, expect.any(Function)));

    const cambiado = { ...original, contenido: evento === 'messageDeleted' ? '' : 'editado', eliminadoEn: evento === 'messageDeleted' ? 'x' : null };
    act(() => socket.__emit(evento, { idConversacion: 5, mensaje: cambiado }));

    expect(queryClient.getQueryData(llave)).toEqual([cambiado, otro]);
  });

  it('no inventa cache para una conversacion sin historial cargado', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { queryClient, wrapper } = setup();
    renderHook(() => useGlobalChatSocket([]), { wrapper });
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('messageUpdated', expect.any(Function)));

    act(() => socket.__emit('messageUpdated', { idConversacion: 9, mensaje: { ...original, idConversacion: 9 } }));

    expect(queryClient.getQueryData(conversationMessagesQueryKey(10, 9))).toBeUndefined();
  });

  it('al desmontar quita los listeners', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper } = setup();
    const { unmount } = renderHook(() => useGlobalChatSocket([]), { wrapper });
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('messageDeleted', expect.any(Function)));

    unmount();

    expect(socket.off).toHaveBeenCalledWith('messageUpdated', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('messageDeleted', expect.any(Function));
  });
});
