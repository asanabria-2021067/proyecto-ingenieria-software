import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/components/chat-dock/chat-dock-context', () => ({
  useChatDock: () => ({ windows: [], minimizedIds: [], cerrarChat: vi.fn(), toggleMinimize: vi.fn() }),
}));
vi.mock('@/hooks/use-chat', () => ({
  useAllConversations: () => ({ conversations: [] }),
  useGlobalChatSocket: () => ({ isConnected: true }),
}));
vi.mock('@/components/chat-dock/chat-list-popover', () => ({
  ChatListPopover: () => createElement('div', { 'data-testid': 'lista' }, 'lista'),
}));
vi.mock('@/components/chat-dock/chat-window', () => ({ ChatWindow: () => null }));

import { ChatDock } from '../components/chat-dock/chat-dock';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function abrirLista() {
  render(createElement(ChatDock));
  fireEvent.click(screen.getByRole('button', { name: /^mensajes/i }));
  expect(screen.getByTestId('lista')).toBeInTheDocument();
}

// Radix renderiza dialogos y listas desplegables (Select) en portales, fuera del contenedor de la lista.
function enPortal(role: string) {
  const el = document.createElement('div');
  el.setAttribute('role', role);
  document.body.appendChild(el);
  return el;
}

describe('ChatDock: clic fuera de la lista', () => {
  it('cierra la lista con un clic en cualquier otro lado', () => {
    abrirLista();
    const otro = document.createElement('div');
    document.body.appendChild(otro);
    fireEvent.mouseDown(otro);
    expect(screen.queryByTestId('lista')).not.toBeInTheDocument();
  });

  it('no cierra la lista con un clic dentro de un dialogo en portal', () => {
    abrirLista();
    fireEvent.mouseDown(enPortal('dialog'));
    expect(screen.getByTestId('lista')).toBeInTheDocument();
  });

  it('no cierra la lista al elegir una opcion de una lista desplegable (Select) en portal', () => {
    abrirLista();
    fireEvent.mouseDown(enPortal('listbox'));
    expect(screen.getByTestId('lista')).toBeInTheDocument();
  });
});
