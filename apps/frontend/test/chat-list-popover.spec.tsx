import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));

const abrirChat = vi.fn();
vi.mock('@/components/chat-dock/chat-dock-context', () => ({ useChatDock: () => ({ abrirChat }) }));

const listAllConversationsMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({ listAllConversations: (...args: unknown[]) => listAllConversationsMock(...args) }));

import { ChatListPopover } from '../components/chat-dock/chat-list-popover';
import type { ChatConversacionGlobal } from '../lib/types/chat';

function conversacion(overrides: Partial<ChatConversacionGlobal> = {}): ChatConversacionGlobal {
  return {
    idConversacion: 1,
    idProyecto: 10,
    proyecto: { idProyecto: 10, tituloProyecto: 'Feria de Ciencias' },
    tipo: 'INDIVIDUAL',
    nombre: null,
    nombrePersonalizado: null,
    participantes: [
      { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null },
      { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
    ],
    ultimoMensaje: { idMensaje: 1, idConversacion: 1, contenido: 'Hola', enviadoEn: new Date().toISOString(), remitente: { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null } },
    ultimoMensajeEsPropio: false,
    noLeidos: 0,
    esFavorita: false,
    archivadaManual: false,
    silenciada: false,
    esPrioritaria: true,
    ...overrides,
  };
}

function renderPopover() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client }, createElement(ChatListPopover, { onClose: vi.fn() })),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatListPopover', () => {
  it('lista los chats prioritarios por defecto y muestra el badge de proyecto', async () => {
    listAllConversationsMock.mockResolvedValue([conversacion()]);
    renderPopover();

    expect(await screen.findByText('Rosa Fuentes')).toBeInTheDocument();
    expect(screen.getByText('Feria de Ciencias')).toBeInTheDocument();
  });

  it('la pestaña Otros filtra por esPrioritaria: false', async () => {
    listAllConversationsMock.mockResolvedValue([
      conversacion({ idConversacion: 1, esPrioritaria: true }),
      conversacion({
        idConversacion: 2,
        esPrioritaria: false,
        participantes: [
          { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null },
          { idUsuario: 3, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null },
        ],
      }),
    ]);
    renderPopover();

    await screen.findByText('Rosa Fuentes');
    expect(screen.queryByText('Carlos Mendoza')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Otros' }));

    expect(await screen.findByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.queryByText('Rosa Fuentes')).not.toBeInTheDocument();
  });

  it('escribir en el buscador consulta listAllConversations con el texto (con debounce)', async () => {
    listAllConversationsMock.mockResolvedValue([]);
    renderPopover();
    await waitFor(() => expect(listAllConversationsMock).toHaveBeenCalledWith(undefined));

    fireEvent.change(screen.getByPlaceholderText('Buscar mensajes'), { target: { value: 'rosa' } });

    await waitFor(() => expect(listAllConversationsMock).toHaveBeenCalledWith('rosa'), { timeout: 1000 });
  });

  it('al hacer click en un chat, lo abre en el dock y cierra el popover', async () => {
    const onClose = vi.fn();
    listAllConversationsMock.mockResolvedValue([conversacion({ idProyecto: 7, idConversacion: 42 })]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(QueryClientProvider, { client }, createElement(ChatListPopover, { onClose })));

    fireEvent.click(await screen.findByText('Rosa Fuentes'));

    expect(abrirChat).toHaveBeenCalledWith(7, 42);
    expect(onClose).toHaveBeenCalled();
  });
});
