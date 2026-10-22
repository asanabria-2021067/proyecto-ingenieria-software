import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollTo ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
vi.mock('@/lib/mensajes', () => ({ confirmar: vi.fn() }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

const getAttachmentUrl = vi.fn();
vi.mock('@/lib/services/chat', () => ({ getAttachmentUrl: (...a: unknown[]) => getAttachmentUrl(...a) }));

const sendFileMutate = vi.fn();
const sendMutate = vi.fn();
let mensajes: unknown[] = [];
let miniatura: { data?: string } = {};
vi.mock('@/hooks/use-chat', () => ({
  useMessages: () => ({ messages: mensajes, isLoading: false }),
  useSendMessage: () => ({ mutate: sendMutate, isPending: false }),
  useSendFileMessage: () => ({ mutate: sendFileMutate, isPending: false }),
  useAttachmentThumbnail: () => miniatura,
  useUpdateConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useAllConversations: () => ({ conversations: [] }),
  useReadReceipts: () => ({ lecturas: [] }),
  useLoadOlderMessages: () => async () => [],
  useToggleReaction: () => ({ mutate: vi.fn() }),
  useEditMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useLinkPreview: () => ({ data: undefined }),
  useUpdateChatTheme: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSavedMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useScheduledMessages: () => ({ programados: [], isLoading: false }),
  useScheduleMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelScheduledMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkConversationRead: () => ({ mutate: vi.fn() }),
  useSilenciarConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ChatWindow } from '../components/chat-dock/chat-window';

const remitente = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
const mensaje = (id: number, extra: Record<string, unknown>) => ({
  idMensaje: id,
  idConversacion: 5,
  contenido: '',
  enviadoEn: '2026-10-01T12:00:00.000Z',
  remitente,
  adjunto: null,
  ...extra,
});

function abrir() {
  render(
    createElement(ChatWindow, {
      idProyecto: 10,
      idConversacion: 5,
      minimized: false,
      onMinimize: vi.fn(),
      onClose: vi.fn(),
    }),
  );
}

function elegir(nombre: string, tipo: string, bytes = 100) {
  const f = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  fireEvent.change(screen.getByTestId('adjunto-input'), { target: { files: [f] } });
  return f;
}

afterEach(() => {
  cleanup();
  mensajes = [];
  miniatura = {};
  vi.clearAllMocks();
});

describe('ChatWindow - adjuntos', () => {
  it('el boton de adjuntar es accesible y abre el selector con la lista blanca', () => {
    abrir();
    const input = screen.getByTestId('adjunto-input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Adjuntar archivo' }));
    expect(click).toHaveBeenCalled();
    expect(input.accept).toContain('application/pdf');
    expect(input.accept).toContain('.xlsx');
  });

  it('un archivo invalido muestra el error y no queda adjunto', () => {
    abrir();
    elegir('virus.exe', 'application/x-msdownload');
    expect(screen.getByRole('alert')).toHaveTextContent('Tipo de archivo no permitido');
    expect(screen.queryByTestId('adjunto-previa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('un archivo de mas de 10 MB muestra el error de tamano', () => {
    abrir();
    elegir('grande.pdf', 'application/pdf', 10 * 1024 * 1024 + 1);
    expect(screen.getByRole('alert')).toHaveTextContent('10 MB');
  });

  it('un archivo valido muestra la vista previa, se puede quitar y habilita enviar', () => {
    abrir();
    elegir('informe.pdf', 'application/pdf', 2048);
    const previa = screen.getByTestId('adjunto-previa');
    expect(previa).toHaveTextContent('informe.pdf');
    expect(previa).toHaveTextContent('2.0 KB');
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar informe.pdf' }));
    expect(screen.queryByTestId('adjunto-previa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('envia el archivo con el texto y limpia al terminar', () => {
    abrir();
    const f = elegir('informe.pdf', 'application/pdf');
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje…'), { target: { value: ' mira esto ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(sendFileMutate).toHaveBeenCalledTimes(1);
    const [vars, opciones] = sendFileMutate.mock.calls[0];
    expect(vars).toEqual({ contenido: 'mira esto', archivo: f });
    expect(sendMutate).not.toHaveBeenCalled();

    opciones.onSuccess();
    return waitFor(() => {
      expect(screen.queryByTestId('adjunto-previa')).toBeNull();
      expect(screen.getByPlaceholderText('Escribe un mensaje…')).toHaveValue('');
    });
  });

  it('si el envio falla muestra el error del servidor y conserva el archivo', async () => {
    abrir();
    elegir('informe.pdf', 'application/pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    sendFileMutate.mock.calls[0][1].onError(new Error('El archivo supera el máximo de 10 MB'));
    expect(await screen.findByRole('alert')).toHaveTextContent('supera el máximo');
    expect(screen.getByTestId('adjunto-previa')).toBeInTheDocument();
  });

  it('un mensaje solo texto sigue usando el envio normal', () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje…'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(sendMutate).toHaveBeenCalledWith({ contenido: 'hola' });
    expect(sendFileMutate).not.toHaveBeenCalled();
  });

  it('muestra el chip del adjunto con nombre, tipo y tamano, sin texto vacio', () => {
    mensajes = [
      mensaje(1, { adjunto: { idAdjunto: 7, nombreOriginal: 'hoja.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tamanoBytes: 3 * 1024 * 1024 } }),
    ];
    abrir();
    expect(screen.getByText('hoja.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/Excel · 3.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar hoja.xlsx' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('muestra miniatura solo para imagenes con miniatura blob', () => {
    mensajes = [mensaje(1, { adjunto: { idAdjunto: 8, nombreOriginal: 'foto.png', mime: 'image/png', tamanoBytes: 500 } })];
    miniatura = { data: 'data:image/png;base64,AAAA' };
    abrir();
    expect(screen.getByRole('img', { name: 'foto.png' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('pide la URL firmada solo al hacer clic en descargar', async () => {
    mensajes = [mensaje(1, { adjunto: { idAdjunto: 7, nombreOriginal: 'a.pdf', mime: 'application/pdf', tamanoBytes: 10 } })];
    getAttachmentUrl.mockResolvedValue({ url: 'https://api.cloudinary.com/dl', nombreOriginal: 'a.pdf', mime: 'application/pdf', expiraEnSegundos: 60 });
    abrir();
    expect(getAttachmentUrl).not.toHaveBeenCalled();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: 'Descargar a.pdf' }));
    await waitFor(() => expect(clic).toHaveBeenCalled());
    expect(getAttachmentUrl).toHaveBeenCalledWith(10, 5, 7);
    clic.mockRestore();
  });

  it('avisa si no se pudo obtener la URL de descarga', async () => {
    mensajes = [mensaje(1, { adjunto: { idAdjunto: 7, nombreOriginal: 'a.pdf', mime: 'application/pdf', tamanoBytes: 10 } })];
    getAttachmentUrl.mockRejectedValue(new Error('403'));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar a.pdf' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('No se pudo descargar')));
  });
});
