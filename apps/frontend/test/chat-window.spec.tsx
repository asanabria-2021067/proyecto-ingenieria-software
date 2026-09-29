import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));

const sendMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock('@/hooks/use-chat', () => ({
  useMessages: () => ({ messages: [], isLoading: false }),
  useSendMessage: () => ({ mutate: sendMutate, isPending: false }),
  useUpdateConversation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteConversation: () => ({ mutate: deleteMutate, isPending: false }),
  useAllConversations: () => ({
    conversations: [
      {
        idConversacion: 5,
        idProyecto: 10,
        proyecto: { idProyecto: 10, tituloProyecto: 'Feria' },
        tipo: 'INDIVIDUAL',
        nombre: null,
        nombrePersonalizado: null,
        participantes: [
          { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null },
          { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
        ],
        ultimoMensaje: null,
        ultimoMensajeEsPropio: false,
        noLeidos: 0,
        esFavorita: false,
        archivadaManual: false,
        silenciada: false,
        esPrioritaria: true,
      },
    ],
  }),
}));

const confirmarMock = vi.fn();
vi.mock('@/lib/mensajes', () => ({ confirmar: (...args: unknown[]) => confirmarMock(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ChatWindow } from '../components/chat-dock/chat-window';

function renderWindow(overrides: Partial<Parameters<typeof ChatWindow>[0]> = {}) {
  const onClose = vi.fn();
  const onMinimize = vi.fn();
  render(
    createElement(ChatWindow, {
      idProyecto: 10,
      idConversacion: 5,
      minimized: false,
      onMinimize,
      onClose,
      ...overrides,
    }),
  );
  return { onClose, onMinimize };
}

async function abrirMenu() {
  const trigger = screen.getByRole('button', { name: 'Opciones de la conversación' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatWindow', () => {
  it('muestra el nombre de la otra persona en la cabecera', () => {
    renderWindow();
    expect(screen.getByText('Rosa Fuentes')).toBeInTheDocument();
  });

  it('enviar un mensaje llama a la mutation y limpia el input', () => {
    renderWindow();
    const input = screen.getByPlaceholderText('Escribe un mensaje…');
    fireEvent.change(input, { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(sendMutate).toHaveBeenCalledWith('Hola');
    expect(input).toHaveValue('');
  });

  it('marcar como favorito llama a updateConversation con esFavorita: true', async () => {
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Marcar como favorito'));

    expect(updateMutate).toHaveBeenCalledWith({ idConversacion: 5, payload: { esFavorita: true } });
  });

  it('silenciar llama a updateConversation con silenciada: true', async () => {
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Silenciar'));

    expect(updateMutate).toHaveBeenCalledWith({ idConversacion: 5, payload: { silenciada: true } });
  });

  it('mover a Otros llama a updateConversation con esPrioritaria: false', async () => {
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Mover a Otros'));

    expect(updateMutate).toHaveBeenCalledWith({ idConversacion: 5, payload: { esPrioritaria: false } });
  });

  it('ver perfil navega a la página de la persona', async () => {
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Ver perfil'));

    expect(push).toHaveBeenCalledWith('/dashboard/personas/2');
  });

  it('borrar conversación pide confirmación antes de eliminar', async () => {
    confirmarMock.mockResolvedValue(false);
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Borrar conversación'));

    await waitFor(() => expect(confirmarMock).toHaveBeenCalled());
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('confirmando el borrado, elimina y cierra la ventana', async () => {
    confirmarMock.mockResolvedValue(true);
    deleteMutate.mockImplementation((_id: number, opts: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const { onClose } = renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText('Borrar conversación'));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('minimizada, no muestra el historial ni el input', () => {
    renderWindow({ minimized: true });
    expect(screen.queryByPlaceholderText('Escribe un mensaje…')).not.toBeInTheDocument();
  });
});
