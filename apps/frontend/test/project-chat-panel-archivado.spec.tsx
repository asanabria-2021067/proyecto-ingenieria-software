import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatConversacion, ChatMensaje } from '@/lib/types/chat';

// T-237 (parte de interfaz de T-234): un chat archivado se abre en solo
// lectura — banner visible y sin caja de texto para escribir. Aísla
// ProjectChatPanel de sus hooks reales (socket, TanStack Query) igual que
// dashboard-hours.spec.tsx aísla DashboardPage.

const CONVERSACION_ARCHIVADA: ChatConversacion = {
  idConversacion: 1,
  tipo: 'INDIVIDUAL',
  nombre: null,
  participantes: [
    { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null },
    { idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', fotoUrl: null },
  ],
  ultimoMensaje: null,
  noLeidos: 0,
  archivada: true,
};

const MENSAJES: ChatMensaje[] = [
  {
    idMensaje: 1,
    idConversacion: 1,
    contenido: 'Último mensaje antes del cierre',
    enviadoEn: new Date().toISOString(),
    remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', fotoUrl: null },
  },
];

vi.mock('@/hooks/use-chat', () => ({
  useConversations: () => ({ conversations: [CONVERSACION_ARCHIVADA], isLoading: false }),
  useCreateConversation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMarkConversationRead: () => ({ mutate: vi.fn() }),
  useMessages: () => ({ messages: MENSAJES, isLoading: false }),
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useChatSocket: () => ({ isConnected: true }),
}));

vi.mock('@/components/projects/chat-panel-context', () => ({
  useChatPanel: () => ({ pendingChatUserId: null, clearPendingChat: vi.fn() }),
}));

describe('ProjectChatPanel — conversación archivada (T-234/T-237)', () => {
  it('al abrir una conversación archivada, muestra el banner de solo lectura y el historial, pero no la caja de escribir', async () => {
    const { ProjectChatPanel } = await import('@/components/projects/project-chat-panel');
    render(
      <ProjectChatPanel
        idProyecto={10}
        habilitado
        currentUserId={1}
        members={[]}
      />,
    );

    fireEvent.click(screen.getByText('Luis Gómez'));

    expect(
      await screen.findByText(/proyecto ya cerró.*solo lectura/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Último mensaje antes del cierre')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Escribe un mensaje…')).not.toBeInTheDocument();
  });
});
