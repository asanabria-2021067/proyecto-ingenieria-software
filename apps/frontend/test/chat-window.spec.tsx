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

const markReadMutate = vi.fn();
let mensajesMock: any[] = [];
let lecturasMock: any[] = [];
const sendMutate = vi.fn();
const sendFileMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const silenciarMutate = vi.fn();
const silencio = vi.hoisted(() => ({ siempre: false }));
vi.mock('@/hooks/use-chat', () => ({
  useMessages: () => ({ messages: mensajesMock, isLoading: false }),
  useReadReceipts: () => ({ lecturas: lecturasMock }),
  useMarkConversationRead: () => ({ mutate: markReadMutate }),
  useSendMessage: () => ({ mutate: sendMutate, isPending: false }),
  useSendFileMessage: () => ({ mutate: sendFileMutate, isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useUpdateConversation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteConversation: () => ({ mutate: deleteMutate, isPending: false }),
  useSilenciarConversation: () => ({ mutate: silenciarMutate, isPending: false }),
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
        silenciadaPorMi: false,
        silenciadaHasta: null,
        get silenciadaSiempre() {
          return silencio.siempre;
        },
        esPrioritaria: true,
      },
    ],
  }),
}));

const confirmarMock = vi.fn();
vi.mock('@/lib/mensajes', () => ({ confirmar: (...args: unknown[]) => confirmarMock(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/components/chat-dock/no-molestar-dialog', () => ({
  NoMolestarDialog: () => createElement('div', { role: 'dialog', 'aria-label': 'No molestar' }),
}));

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
  silencio.siempre = false;
  cleanup();
  vi.clearAllMocks();
  mensajesMock = [];
  lecturasMock = [];
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

  it.each([
    ['Silenciar 1 hora', '1h'],
    ['Silenciar 8 horas', '8h'],
    ['Silenciar siempre', 'siempre'],
  ])('%s llama a la mutation de silencio con %s', async (texto, duracion) => {
    renderWindow();
    await abrirMenu();
    fireEvent.click(screen.getByText(texto));

    expect(silenciarMutate).toHaveBeenCalledWith({ idConversacion: 5, duracion });
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('con el chat silenciado muestra el indicador y permite activar notificaciones', async () => {
    silencio.siempre = true;
    renderWindow();
    expect(screen.getByText('Silenciado')).toBeInTheDocument();
    await abrirMenu();
    expect(screen.queryByText('Silenciar 1 hora')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Activar notificaciones'));

    expect(silenciarMutate).toHaveBeenCalledWith({ idConversacion: 5, duracion: null });
  });

  it('No molestar por horario abre el dialogo de configuracion', async () => {
    renderWindow();
    expect(screen.queryByRole('dialog', { name: 'No molestar' })).not.toBeInTheDocument();
    await abrirMenu();
    fireEvent.click(screen.getByText('No molestar por horario'));

    expect(await screen.findByRole('dialog', { name: 'No molestar' })).toBeInTheDocument();
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
  describe('escribiendo, visto por y leido', () => {
    const mensaje = (idMensaje: number, idRemitente: number, enviadoEn: string) => ({
      idMensaje,
      idConversacion: 5,
      contenido: `msg ${idMensaje}`,
      enviadoEn,
      remitente: { idUsuario: idRemitente, nombre: idRemitente === 1 ? 'Yo' : 'Rosa', apellido: 'X', fotoUrl: null },
    });

    it('muestra "escribiendo" de la otra persona en una region en vivo', () => {
      renderWindow({ typingUserIds: [2] });
      expect(screen.getByRole('status')).toHaveTextContent('Rosa está escribiendo…');
    });

    it('ignora typing propio y deja la region vacia', () => {
      renderWindow({ typingUserIds: [1] });
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('al teclear llama onTyping; con el campo vacio no', () => {
      const onTyping = vi.fn();
      renderWindow({ onTyping });
      const input = screen.getByPlaceholderText('Escribe un mensaje…');
      fireEvent.change(input, { target: { value: '  ' } });
      expect(onTyping).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: 'ho' } });
      expect(onTyping).toHaveBeenCalledTimes(1);
    });

    it('muestra "Visto por" bajo el ultimo mensaje propio cuando la otra persona lo leyo', () => {
      mensajesMock = [mensaje(1, 1, '2026-10-16T10:00:00Z')];
      lecturasMock = [{ idUsuario: 2, ultimaLecturaEn: '2026-10-16T10:01:00Z' }];
      renderWindow();
      expect(screen.getByTestId('chat-visto-por')).toHaveTextContent('Visto por Rosa');
    });

    it('no muestra "Visto por" si la lectura es anterior al mensaje', () => {
      mensajesMock = [mensaje(1, 1, '2026-10-16T10:00:00Z')];
      lecturasMock = [{ idUsuario: 2, ultimaLecturaEn: '2026-10-16T09:59:00Z' }];
      renderWindow();
      expect(screen.queryByTestId('chat-visto-por')).not.toBeInTheDocument();
    });

    it('marca como leido cuando el ultimo mensaje es ajeno y la ventana esta abierta', () => {
      mensajesMock = [mensaje(1, 2, '2026-10-16T10:00:00Z')];
      renderWindow();
      expect(markReadMutate).toHaveBeenCalledWith(5);
    });

    it('no marca leido si esta minimizada o el ultimo mensaje es propio', () => {
      mensajesMock = [mensaje(1, 2, '2026-10-16T10:00:00Z')];
      renderWindow({ minimized: true });
      cleanup();
      mensajesMock = [mensaje(2, 1, '2026-10-16T10:00:00Z')];
      renderWindow();
      expect(markReadMutate).not.toHaveBeenCalled();
    });
  });
});
