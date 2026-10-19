import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
const themeMutate = vi.fn();
let temaActual: string | null = null;
const silenciarMutate = vi.fn();
const toggleSavedMutate = vi.fn();
const silencio = vi.hoisted(() => ({ siempre: false }));
vi.mock('@/hooks/use-chat', () => ({
  useMessages: () => ({ messages: mensajesMock, isLoading: false }),
  useReadReceipts: () => ({ lecturas: lecturasMock }),
  useMarkConversationRead: () => ({ mutate: markReadMutate }),
  useToggleSavedMessage: () => ({ mutate: toggleSavedMutate, isPending: false }),
  useSendMessage: () => ({ mutate: sendMutate, isPending: false }),
  useSendFileMessage: () => ({ mutate: sendFileMutate, isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useLoadOlderMessages: () => async () => [],
  useToggleReaction: () => ({ mutate: vi.fn() }),
  useUpdateConversation: () => ({ mutate: updateMutate, isPending: false }),
  useUpdateChatTheme: () => ({ mutate: themeMutate, isPending: false }),
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
        temaColor: temaActual,
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
  temaActual = null;
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

    expect(sendMutate).toHaveBeenCalledWith({ contenido: 'Hola', idMensajeCitado: undefined });
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

  describe('guardar mensajes', () => {
    const remitente = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
    const mensaje = (idMensaje: number, guardado?: boolean) => ({
      idMensaje,
      idConversacion: 5,
      contenido: `mensaje ${idMensaje}`,
      enviadoEn: new Date().toISOString(),
      remitente,
      guardado,
    });

    it('un mensaje sin guardar ofrece "Guardar mensaje" con aria-pressed=false y lo guarda al activarlo', () => {
      mensajesMock = [mensaje(7, false)];
      renderWindow();

      const boton = screen.getByRole('button', { name: 'Guardar mensaje' });
      expect(boton).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(boton);

      expect(toggleSavedMutate).toHaveBeenCalledWith(7, expect.any(Object));
    });

    it('un mensaje guardado ofrece "Quitar de guardados" con aria-pressed=true', () => {
      mensajesMock = [mensaje(8, true), mensaje(9)];
      renderWindow();

      expect(screen.getByRole('button', { name: 'Quitar de guardados' })).toHaveAttribute('aria-pressed', 'true');
      // `guardado` ausente (mensaje llegado por socket) cuenta como no guardado.
      expect(screen.getByRole('button', { name: 'Guardar mensaje' })).toHaveAttribute('aria-pressed', 'false');
    });
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

  describe('tema de color', () => {
    async function abrirSelector() {
      await abrirMenu();
      fireEvent.click(screen.getByText('Tema de color'));
      return screen.findByRole('radiogroup', { name: 'Tema de color de la conversación' });
    }

    it('el selector es un radiogroup con el nombre textual de cada color', async () => {
      renderWindow();
      const grupo = await abrirSelector();

      const nombres = within(grupo).getAllByRole('radio').map((r) => r.parentElement?.textContent);
      expect(nombres).toEqual(['Predeterminado', 'Verde', 'Azul', 'Violeta', 'Naranja', 'Rosa', 'Gris']);
      expect(within(grupo).getByRole('radio', { name: 'Predeterminado' })).toBeChecked();
    });

    it('elegir un color llama a la mutation con su clave', async () => {
      renderWindow();
      await abrirSelector();
      fireEvent.click(screen.getByRole('radio', { name: 'Azul' }));

      expect(themeMutate).toHaveBeenCalledWith({ idConversacion: 5, temaColor: 'azul' });
    });

    it('elegir Predeterminado limpia el tema con null', async () => {
      temaActual = 'rosa';
      renderWindow();
      await abrirSelector();
      expect(screen.getByRole('radio', { name: 'Rosa' })).toBeChecked();
      fireEvent.click(screen.getByRole('radio', { name: 'Predeterminado' }));

      expect(themeMutate).toHaveBeenCalledWith({ idConversacion: 5, temaColor: null });
    });

    it('se puede navegar con el teclado: flecha abajo mueve la selección', async () => {
      renderWindow();
      await abrirSelector();
      const predeterminado = screen.getByRole('radio', { name: 'Predeterminado' });
      predeterminado.focus();
      fireEvent.keyDown(predeterminado, { key: 'ArrowDown' });

      await waitFor(() => expect(screen.getByRole('radio', { name: 'Verde' })).toHaveFocus());
      await waitFor(() => expect(themeMutate).toHaveBeenCalledWith({ idConversacion: 5, temaColor: 'verde' }));
    });

    it('la burbuja propia usa las clases del tema y la ajena no cambia', () => {
      temaActual = 'verde';
      const remitente = (idUsuario: number) => ({ idUsuario, nombre: 'N', apellido: 'A', fotoUrl: null });
      mensajesMock = [
        { idMensaje: 1, idConversacion: 5, contenido: 'mio', enviadoEn: '2026-01-01T10:00:00Z', remitente: remitente(1) },
        { idMensaje: 2, idConversacion: 5, contenido: 'suyo', enviadoEn: '2026-01-01T10:01:00Z', remitente: remitente(2) },
      ];
      renderWindow();

      expect(screen.getByText('mio').parentElement).toHaveClass('bg-green-700', 'text-white');
      expect(screen.getByText('suyo').parentElement).not.toHaveClass('bg-green-700');
    });

    it('sin tema, la burbuja propia conserva el color por defecto', () => {
      mensajesMock = [
        { idMensaje: 1, idConversacion: 5, contenido: 'mio', enviadoEn: '2026-01-01T10:00:00Z', remitente: { idUsuario: 1, nombre: 'Yo', apellido: 'U', fotoUrl: null } },
      ];
      renderWindow();

      expect(screen.getByText('mio').parentElement).toHaveClass('bg-primary');
    });
  });
});

describe('ChatWindow - responder citando un mensaje', () => {
  const rosa = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
  const base = { idConversacion: 5, enviadoEn: '2026-10-16T10:00:00Z', remitente: rosa };

  it('Responder muestra la vista previa y el envio incluye idMensajeCitado', () => {
    mensajesMock = [{ ...base, idMensaje: 7, contenido: 'Nos vemos a las 3' }];
    renderWindow();

    fireEvent.click(screen.getByRole('button', { name: 'Responder a Rosa' }));
    expect(screen.getByText('Respondiendo a Rosa Fuentes')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje…'), { target: { value: 'Va' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(sendMutate).toHaveBeenCalledWith({ contenido: 'Va', idMensajeCitado: 7 });
    expect(screen.queryByText('Respondiendo a Rosa Fuentes')).not.toBeInTheDocument();
  });

  it('Esc y el boton cancelan la respuesta sin enviar nada', () => {
    mensajesMock = [{ ...base, idMensaje: 7, contenido: 'Hola' }];
    renderWindow();
    const input = screen.getByPlaceholderText('Escribe un mensaje…');

    fireEvent.click(screen.getByRole('button', { name: 'Responder a Rosa' }));
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Respondiendo a Rosa Fuentes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Responder a Rosa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar respuesta' }));
    expect(screen.queryByText('Respondiendo a Rosa Fuentes')).not.toBeInTheDocument();
    expect(sendMutate).not.toHaveBeenCalled();
  });

  it('muestra la cita dentro de la burbuja', () => {
    mensajesMock = [
      { ...base, idMensaje: 8, contenido: 'Respuesta', citado: { idMensaje: 7, remitente: rosa, extracto: 'Original' } },
    ];
    renderWindow();

    expect(screen.getByRole('button', { name: /Ir al mensaje original de Rosa Fuentes/ })).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });
});
