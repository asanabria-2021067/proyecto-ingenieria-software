import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversacion, ChatMensaje } from '@/lib/types/chat';
import type { MiembroProyecto } from '@/hooks/use-project-members';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// T-204 (lote 2): complementa project-chat-panel-archivado.spec.tsx (que solo
// cubre el caso de solo-lectura de una conversación archivada) con el flujo
// normal — listar, abrir, enviar mensaje y crear un chat nuevo — siguiendo el
// mismo aislamiento de hooks (use-chat, chat-panel-context).

const useConversationsMock = vi.fn();
const useCreateConversationMock = vi.fn();
const useMarkConversationReadMock = vi.fn();
const useMessagesMock = vi.fn();
const useSendMessageMock = vi.fn();
const useChatSocketMock = vi.fn();

vi.mock('@/hooks/use-chat', () => ({
  useConversations: (...args: unknown[]) => useConversationsMock(...args),
  useCreateConversation: (...args: unknown[]) => useCreateConversationMock(...args),
  useMarkConversationRead: (...args: unknown[]) => useMarkConversationReadMock(...args),
  useMessages: (...args: unknown[]) => useMessagesMock(...args),
  useSendMessage: (...args: unknown[]) => useSendMessageMock(...args),
  useChatSocket: (...args: unknown[]) => useChatSocketMock(...args),
}));

vi.mock('@/components/projects/chat-panel-context', () => ({
  useChatPanel: () => ({ pendingChatUserId: null, clearPendingChat: vi.fn() }),
}));

const CONVERSACION: ChatConversacion = {
  idConversacion: 5,
  tipo: 'INDIVIDUAL',
  nombre: null,
  participantes: [
    { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null },
    { idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', fotoUrl: null },
  ],
  ultimoMensaje: null,
  noLeidos: 2,
  archivada: false,
};

const MENSAJE: ChatMensaje = {
  idMensaje: 1,
  idConversacion: 5,
  contenido: 'Hola equipo',
  enviadoEn: new Date().toISOString(),
  remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', fotoUrl: null },
};

const MEMBERS: MiembroProyecto[] = [
  { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', correo: 'ana@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 },
  { idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', correo: 'luis@uvg.edu.gt', fotoUrl: null, idRolProyecto: 2 },
  { idUsuario: 3, nombre: 'Marta', apellido: 'Ruiz', correo: 'marta@uvg.edu.gt', fotoUrl: null, idRolProyecto: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  useConversationsMock.mockReturnValue({ conversations: [], isLoading: false });
  useMarkConversationReadMock.mockReturnValue({ mutate: vi.fn() });
  useMessagesMock.mockReturnValue({ messages: [], isLoading: false });
  useSendMessageMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useChatSocketMock.mockReturnValue({ isConnected: true });
  useCreateConversationMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
});

async function renderPanel(members: MiembroProyecto[] = []) {
  const { ProjectChatPanel } = await import('@/components/projects/project-chat-panel');
  return render(<ProjectChatPanel idProyecto={10} habilitado currentUserId={1} members={members} />);
}

describe('ProjectChatPanel (T-204)', () => {
  it('sin conversaciones, muestra el estado vacío', async () => {
    await renderPanel();
    expect(screen.getByText(/Sin chats todavía/i)).toBeInTheDocument();
  });

  it('lista una conversación, al abrirla marca como leída y muestra su historial; enviar un mensaje limpia el input y llama a la mutación', async () => {
    const markReadMutate = vi.fn();
    const sendMutate = vi.fn();
    useConversationsMock.mockReturnValue({ conversations: [CONVERSACION], isLoading: false });
    useMarkConversationReadMock.mockReturnValue({ mutate: markReadMutate });
    useMessagesMock.mockReturnValue({ messages: [MENSAJE], isLoading: false });
    useSendMessageMock.mockReturnValue({ mutate: sendMutate, isPending: false });

    await renderPanel();

    fireEvent.click(screen.getByText('Luis Gómez'));
    expect(markReadMutate).toHaveBeenCalledWith(5);
    expect(await screen.findByText('Hola equipo')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Escribe un mensaje…');
    fireEvent.change(input, { target: { value: 'Todo listo' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    expect(sendMutate).toHaveBeenCalledWith('Todo listo');
    expect(input).toHaveValue('');
  });

  it('crear un chat grupal con varios integrantes llama a la mutación con el payload correcto y abre la conversación creada', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ idConversacion: 99 });
    const markReadMutate = vi.fn();
    useCreateConversationMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false });
    useMarkConversationReadMock.mockReturnValue({ mutate: markReadMutate });

    await renderPanel(MEMBERS);

    fireEvent.click(screen.getByRole('button', { name: /Nuevo chat/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Grupal' }));

    const filaLuis = screen.getByText('Luis Gómez').closest('label')!;
    fireEvent.click(within(filaLuis).getByRole('checkbox'));
    const filaMarta = screen.getByText('Marta Ruiz').closest('label')!;
    fireEvent.click(within(filaMarta).getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Crear chat' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        tipo: 'GRUPAL',
        nombre: undefined,
        idsParticipantes: [2, 3],
      }),
    );
    await waitFor(() => expect(screen.queryByText('Nuevo chat')).not.toBeInTheDocument());
    expect(markReadMutate).toHaveBeenCalledWith(99);
  });

  it('sin integrante seleccionado, enviar el formulario de nuevo chat muestra el error de validación y no llama a la mutación', async () => {
    const mutateAsync = vi.fn();
    useCreateConversationMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false });

    await renderPanel(MEMBERS);

    fireEvent.click(screen.getByRole('button', { name: /Nuevo chat/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear chat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona al menos un integrante.');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('si crear la conversación falla, muestra el mensaje de error sin cerrar el diálogo', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(
      Object.assign(new Error('No se pudo crear el chat'), { statusCode: 400 }),
    );
    useCreateConversationMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false });

    await renderPanel(MEMBERS);

    fireEvent.click(screen.getByRole('button', { name: /Nuevo chat/i }));
    const filaLuis = screen.getByText('Luis Gómez').closest('label')!;
    fireEvent.click(within(filaLuis).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear chat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear el chat');
    expect(screen.getByText('Nuevo chat')).toBeInTheDocument();
  });
});
