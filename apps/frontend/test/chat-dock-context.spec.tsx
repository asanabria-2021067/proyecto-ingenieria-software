import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

const createConversationMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({ createConversation: createConversationMock }));

import { ChatDockProvider, useChatDock } from '../components/chat-dock/chat-dock-context';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, createElement(ChatDockProvider, null, children));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChatDockProvider — máximo 3 chats expandidos a la vez', () => {
  it('abrir 4 chats minimiza el más antiguo, dejando 3 expandidos', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper });

    act(() => result.current.abrirChat(1, 101));
    act(() => result.current.abrirChat(1, 102));
    act(() => result.current.abrirChat(1, 103));
    act(() => result.current.abrirChat(1, 104));

    expect(result.current.windows.map((w) => w.idConversacion)).toEqual([101, 102, 103, 104]);
    expect(result.current.minimizedIds.has(101)).toBe(true);
    expect(result.current.minimizedIds.has(102)).toBe(false);
    expect(result.current.minimizedIds.has(103)).toBe(false);
    expect(result.current.minimizedIds.has(104)).toBe(false);
  });

  it('reabrir un chat ya minimizado lo expande de nuevo, minimizando otro si ya hay 3 abiertos', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper });

    act(() => result.current.abrirChat(1, 101));
    act(() => result.current.abrirChat(1, 102));
    act(() => result.current.abrirChat(1, 103));
    act(() => result.current.abrirChat(1, 104)); // minimiza 101

    act(() => result.current.abrirChat(1, 101)); // reabrir 101

    expect(result.current.minimizedIds.has(101)).toBe(false);
    expect(result.current.minimizedIds.has(102)).toBe(true);
  });

  it('cerrar un chat lo quita de la lista y de minimizados', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper });

    act(() => result.current.abrirChat(1, 101));
    act(() => result.current.cerrarChat(101));

    expect(result.current.windows).toHaveLength(0);
    expect(result.current.minimizedIds.has(101)).toBe(false);
  });

  it('toggleMinimize expande y contrae una ventana existente', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper });

    act(() => result.current.abrirChat(1, 101));
    act(() => result.current.toggleMinimize(101));
    expect(result.current.minimizedIds.has(101)).toBe(true);

    act(() => result.current.toggleMinimize(101));
    expect(result.current.minimizedIds.has(101)).toBe(false);
  });

  it('iniciarChatCon crea la conversación y la abre', async () => {
    createConversationMock.mockResolvedValue({ idConversacion: 55 });
    const { result } = renderHook(() => useChatDock(), { wrapper });

    await act(() => result.current.iniciarChatCon(1, 9));

    expect(createConversationMock).toHaveBeenCalledWith(1, { tipo: 'INDIVIDUAL', idsParticipantes: [9] });
    expect(result.current.windows).toEqual([{ idProyecto: 1, idConversacion: 55 }]);
  });
});

describe('useChatDock sin Provider', () => {
  it('las funciones quedan como no-op en vez de reventar', () => {
    const { result } = renderHook(() => useChatDock());
    expect(() => result.current.abrirChat(1, 1)).not.toThrow();
    expect(result.current.windows).toEqual([]);
  });
});
