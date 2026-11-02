import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const ruta = vi.hoisted(() => ({ pathname: '/dashboard/mensajes', id: '7' }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => ruta.pathname,
  useParams: () => ({ id: ruta.id }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

const conversaciones = vi.hoisted(() => ({ lista: [] as unknown[], cargando: false }));
vi.mock('@/hooks/use-chat', () => ({
  useAllConversations: () => ({ conversations: conversaciones.lista, isLoading: conversaciones.cargando }),
  useNoMolestar: () => ({ config: undefined }),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
vi.mock('@/components/chat-dock/saved-messages-dialog', () => ({ SavedMessagesDialog: () => null }));
vi.mock('@/components/chat-dock/chat-list-popover', () => ({
  ChatListPopover: (props: { idActiva: number | null }) => createElement('div', { 'data-testid': 'lista' }, `activa:${props.idActiva}`),
}));
vi.mock('@/components/chat-dock/chat-window', () => ({
  ChatWindow: (props: { idProyecto: number; idConversacion: number; variante: string; onClose: () => void }) =>
    createElement('button', { type: 'button', onClick: props.onClose }, `ventana ${props.variante} ${props.idProyecto}/${props.idConversacion}`),
}));

import MensajesLayout from '../app/dashboard/mensajes/layout';
import MensajesConversacionPage from '../app/dashboard/mensajes/[id]/page';
import { ChatListLauncher } from '../components/chat-dock/chat-list-launcher';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  conversaciones.lista = [];
  conversaciones.cargando = false;
  ruta.pathname = '/dashboard/mensajes';
  ruta.id = '7';
});

describe('icono Mensajes de la barra superior', () => {
  it('es un enlace a /dashboard/mensajes', () => {
    render(createElement(ChatListLauncher, { variante: 'barra' }));
    expect(screen.getByRole('link', { name: /^mensajes/i })).toHaveAttribute('href', '/dashboard/mensajes');
  });
});

describe('MensajesLayout', () => {
  it('en /dashboard/mensajes muestra la lista y oculta el panel de conversación en móvil', () => {
    render(createElement(MensajesLayout, null, createElement('p', null, 'panel')));
    expect(screen.getByLabelText('Conversaciones')).not.toHaveClass('hidden');
    expect(screen.getByText('panel').parentElement).toHaveClass('hidden');
    expect(screen.getByTestId('lista')).toHaveTextContent('activa:null');
  });

  it('en /dashboard/mensajes/<id> oculta la lista en móvil y marca la conversación activa', () => {
    ruta.pathname = '/dashboard/mensajes/7';
    render(createElement(MensajesLayout, null, createElement('p', null, 'panel')));
    expect(screen.getByLabelText('Conversaciones')).toHaveClass('hidden');
    expect(screen.getByText('panel').parentElement).not.toHaveClass('hidden');
    expect(screen.getByTestId('lista')).toHaveTextContent('activa:7');
  });
});

describe('/dashboard/mensajes/[id]', () => {
  it('abre la conversación a pantalla completa con su proyecto y vuelve a la lista', () => {
    conversaciones.lista = [{ idConversacion: 7, idProyecto: 3 }];
    render(createElement(MensajesConversacionPage));
    fireEvent.click(screen.getByRole('button', { name: 'ventana pagina 3/7' }));
    expect(push).toHaveBeenCalledWith('/dashboard/mensajes');
  });

  it('si la conversación no existe ofrece volver a mensajes', () => {
    render(createElement(MensajesConversacionPage));
    expect(screen.getByRole('link', { name: 'Volver a mensajes' })).toHaveAttribute('href', '/dashboard/mensajes');
  });
});
