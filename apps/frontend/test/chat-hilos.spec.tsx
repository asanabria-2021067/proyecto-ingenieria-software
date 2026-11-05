import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

const getHiloMock = vi.hoisted(() => vi.fn());
const sendRespuestaMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({
  getHilo: (...args: unknown[]) => getHiloMock(...args),
  sendRespuesta: (...args: unknown[]) => sendRespuestaMock(...args),
  getEstadoDe: vi.fn(),
}));
vi.mock('@/hooks/use-chat', () => ({
  useEditMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSavedMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useLinkPreview: () => ({ data: undefined }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ChatHiloPanel } from '../components/chat-dock/chat-hilo-panel';
import { ChatMessageItem } from '../components/chat-dock/chat-message-item';
import { descontarRespuesta, etiquetaRespuestas, registrarRespuesta } from '../lib/chat-hilos';
import { conversationMessagesQueryKey, hiloQueryKey } from '../lib/query-keys/chat';
import type { ChatMensaje } from '../lib/types/chat';

const remitente = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
const mensaje = (idMensaje: number, extra: Partial<ChatMensaje> = {}): ChatMensaje => ({
  idMensaje,
  idConversacion: 5,
  contenido: `texto ${idMensaje}`,
  enviadoEn: '2026-10-16T10:00:00.000Z',
  remitente,
  ...extra,
});

function cliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('etiquetaRespuestas', () => {
  it('singular y plural', () => {
    expect(etiquetaRespuestas(1)).toBe('1 respuesta');
    expect(etiquetaRespuestas(3)).toBe('3 respuestas');
  });
});

describe('cache de hilos', () => {
  it('una respuesta entra al hilo abierto, suma al original y no entra al canal', () => {
    const qc = cliente();
    const canal = conversationMessagesQueryKey(10, 5);
    qc.setQueryData(canal, [mensaje(1, { respuestas: 2 }), mensaje(2)]);
    qc.setQueryData(hiloQueryKey(10, 5, 1), [mensaje(8, { idMensajePadre: 1 })]);

    registrarRespuesta(qc, mensaje(9, { idMensajePadre: 1 }));
    expect(qc.getQueryData<ChatMensaje[]>(hiloQueryKey(10, 5, 1))?.map((m) => m.idMensaje)).toEqual([8, 9]);
    expect(qc.getQueryData<ChatMensaje[]>(canal)?.map((m) => [m.idMensaje, m.respuestas])).toEqual([
      [1, 3],
      [2, undefined],
    ]);
  });

  it('la misma respuesta por dos vias no se cuenta dos veces', () => {
    const qc = cliente();
    qc.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje(1, { respuestas: 1 })]);
    qc.setQueryData(hiloQueryKey(10, 5, 1), [mensaje(8, { idMensajePadre: 1 })]);
    registrarRespuesta(qc, mensaje(8, { idMensajePadre: 1 }));
    expect(qc.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))?.[0].respuestas).toBe(1);
  });

  it('eliminar una respuesta descuenta del original sin bajar de cero', () => {
    const qc = cliente();
    qc.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje(1, { respuestas: 1 })]);
    const eliminada = mensaje(8, { idMensajePadre: 1, eliminadoEn: '2026-10-16T11:00:00.000Z' });
    descontarRespuesta(qc, eliminada);
    descontarRespuesta(qc, eliminada);
    expect(qc.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))?.[0].respuestas).toBe(0);
  });
});

describe('ChatMessageItem con hilo', () => {
  const props = { propio: false, idProyecto: 10, idConversacion: 5, onResponder: vi.fn(), onIrAlOriginal: vi.fn(), onReaccionar: vi.fn() };

  it('muestra «3 respuestas» y abre el hilo', () => {
    const onAbrirHilo = vi.fn();
    render(createElement(ChatMessageItem, { ...props, mensaje: mensaje(1, { respuestas: 3 }), onAbrirHilo }));
    fireEvent.click(screen.getByRole('button', { name: /3 respuestas/ }));
    expect(onAbrirHilo).toHaveBeenCalledWith(expect.objectContaining({ idMensaje: 1 }));
  });

  it('sin respuestas no hay enlace, pero se puede iniciar el hilo', () => {
    const onAbrirHilo = vi.fn();
    render(createElement(ChatMessageItem, { ...props, mensaje: mensaje(1), onAbrirHilo }));
    expect(screen.queryByRole('button', { name: /respuesta/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Responder en hilo a Rosa' }));
    expect(onAbrirHilo).toHaveBeenCalledTimes(1);
  });
});

describe('ChatHiloPanel', () => {
  function abrirPanel(onCerrar = vi.fn()) {
    const qc = cliente();
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(ChatHiloPanel, {
          idProyecto: 10,
          idConversacion: 5,
          mensaje: mensaje(1, { respuestas: 2 }),
          idUsuarioActual: 7,
          onCerrar,
        }),
      ),
    );
    return { qc, onCerrar };
  }

  it('lista las respuestas del hilo y envia una nueva solo a ese hilo', async () => {
    getHiloMock.mockResolvedValue([mensaje(8, { idMensajePadre: 1, contenido: 'primera' }), mensaje(9, { idMensajePadre: 1, contenido: 'segunda' })]);
    sendRespuestaMock.mockResolvedValue(mensaje(10, { idMensajePadre: 1, contenido: 'tercera', remitente: { ...remitente, idUsuario: 7 } }));
    abrirPanel();

    expect(await screen.findByText('primera')).toBeInTheDocument();
    expect(screen.getByText('segunda')).toBeInTheDocument();
    expect(getHiloMock).toHaveBeenCalledWith(10, 5, 1);

    fireEvent.change(screen.getByLabelText('Responder en el hilo'), { target: { value: 'tercera' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));
    await waitFor(() => expect(sendRespuestaMock).toHaveBeenCalledWith(10, 5, 1, 'tercera'));
    expect(await screen.findByText('tercera')).toBeInTheDocument();
  });

  it('Escape y el boton cierran el panel', async () => {
    getHiloMock.mockResolvedValue([]);
    const { onCerrar } = abrirPanel();
    expect(await screen.findByText('Todavía no hay respuestas. Escribe la primera.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Responder en el hilo'), { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar hilo' }));
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });

  it('el boton de enviar no se activa con texto vacio', async () => {
    getHiloMock.mockResolvedValue([]);
    abrirPanel();
    await screen.findByText(/Todavía no hay respuestas/);
    expect(screen.getByRole('button', { name: 'Enviar respuesta' })).toBeDisabled();
  });
});
