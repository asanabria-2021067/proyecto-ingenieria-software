import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

const servicios = vi.hoisted(() => ({
  votePoll: vi.fn(),
  closePoll: vi.fn(),
  setPinned: vi.fn(),
  getPinned: vi.fn(),
  sendVoiceNote: vi.fn(),
  createPoll: vi.fn(),
  getPinnedOrganizacion: vi.fn(),
  setPinnedOrganizacion: vi.fn(),
}));
vi.mock('@/lib/services/chat-extras', () => servicios);

import {
  actualizarEncuestaEnCache,
  encuestaCerrada,
  fijadosQueryKey,
  formatearDuracion,
  misVotos,
  porcentajeOpcion,
  resumenMensaje,
  totalVotantes,
  totalVotos,
} from '../lib/chat-extras';
import { useClosePoll, useCreatePoll, useFijados, usePinMessage, useSendVoiceNote, useVotePoll } from '../hooks/use-chat-extras';
import { useGlobalChatSocket } from '../hooks/use-chat';
import { conversationMessagesQueryKey } from '../lib/query-keys/chat';
import type { ChatEncuesta, ChatMensaje } from '../lib/types/chat';

const encuesta = (extra: Partial<ChatEncuesta> = {}): ChatEncuesta => ({
  idEncuesta: 1,
  pregunta: '¿Dia?',
  multiple: false,
  cierraEn: null,
  cerradaEn: null,
  opciones: [
    { idOpcion: 11, texto: 'Lunes', votos: [{ idUsuario: 1 }, { idUsuario: 2 }] },
    { idOpcion: 12, texto: 'Martes', votos: [{ idUsuario: 3 }] },
    { idOpcion: 13, texto: 'Jueves', votos: [] },
  ],
  ...extra,
});

const usuario = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };
const mensaje = (extra: Partial<ChatMensaje> = {}): ChatMensaje => ({
  idMensaje: 7,
  idConversacion: 5,
  contenido: 'hola',
  enviadoEn: '2026-10-16T10:00:00.000Z',
  remitente: usuario,
  ...extra,
});

afterEach(() => vi.clearAllMocks());

describe('helpers de notas de voz y encuestas', () => {
  it('formatearDuracion da m:ss y no baja de 0', () => {
    expect(formatearDuracion(0)).toBe('0:00');
    expect(formatearDuracion(65)).toBe('1:05');
    expect(formatearDuracion(120)).toBe('2:00');
    expect(formatearDuracion(-3)).toBe('0:00');
  });

  it('cuenta votos y votantes distintos, con porcentaje sobre votantes', () => {
    const e = encuesta();
    expect(totalVotos(e)).toBe(3);
    expect(totalVotantes(e)).toBe(3);
    expect(porcentajeOpcion(e, 11)).toBe(67);
    expect(porcentajeOpcion(e, 13)).toBe(0);
    expect(porcentajeOpcion(encuesta({ opciones: [{ idOpcion: 1, texto: 'a', votos: [] }] }), 1)).toBe(0);
  });

  it('en voto multiple una persona con dos votos cuenta como un votante', () => {
    const e = encuesta({
      multiple: true,
      opciones: [
        { idOpcion: 1, texto: 'a', votos: [{ idUsuario: 1 }] },
        { idOpcion: 2, texto: 'b', votos: [{ idUsuario: 1 }] },
      ],
    });
    expect(totalVotos(e)).toBe(2);
    expect(totalVotantes(e)).toBe(1);
    expect(porcentajeOpcion(e, 1)).toBe(100);
  });

  it('misVotos devuelve las opciones propias', () => {
    expect(misVotos(encuesta(), 1)).toEqual([11]);
    expect(misVotos(encuesta(), 9)).toEqual([]);
    expect(misVotos(encuesta(), null)).toEqual([]);
  });

  it('encuestaCerrada: manual, por fecha vencida y abierta', () => {
    const ahora = Date.parse('2026-11-01T12:00:00Z');
    expect(encuestaCerrada(encuesta({ cerradaEn: '2026-11-01T11:00:00Z' }), ahora)).toBe(true);
    expect(encuestaCerrada(encuesta({ cierraEn: '2026-11-01T11:59:59Z' }), ahora)).toBe(true);
    expect(encuestaCerrada(encuesta({ cierraEn: '2026-11-01T12:00:01Z' }), ahora)).toBe(false);
    expect(encuestaCerrada(encuesta(), ahora)).toBe(false);
  });

  it('resumenMensaje describe encuestas, notas de voz, archivos y texto', () => {
    expect(resumenMensaje(mensaje({ encuesta: encuesta() }))).toBe('Encuesta: ¿Dia?');
    expect(resumenMensaje(mensaje({ contenido: '', adjunto: { idAdjunto: 1, nombreOriginal: 'n.webm', mime: 'audio/webm', tamanoBytes: 5, duracionSegundos: 75 } }))).toBe(
      'Nota de voz (1:15)',
    );
    expect(resumenMensaje(mensaje({ contenido: '', adjunto: { idAdjunto: 1, nombreOriginal: 'a.pdf', mime: 'application/pdf', tamanoBytes: 5 } }))).toBe('a.pdf');
    expect(resumenMensaje(mensaje({ contenido: '  varias\n lineas  ' }))).toBe('varias lineas');
  });
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('cache y hooks de encuestas, notas de voz y fijados', () => {
  it('actualizarEncuestaEnCache cambia solo ese mensaje, en mensajes y en fijados', () => {
    const { queryClient } = setup();
    const otro = mensaje({ idMensaje: 8, encuesta: encuesta({ idEncuesta: 2 }) });
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje({ encuesta: encuesta() }), otro]);
    queryClient.setQueryData(fijadosQueryKey(10, 5), [mensaje({ encuesta: encuesta() })]);
    const nueva = encuesta({ cerradaEn: '2026-11-01T00:00:00Z' });

    actualizarEncuestaEnCache(queryClient, 5, 7, nueva);

    const mensajes = queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))!;
    expect(mensajes[0].encuesta).toEqual(nueva);
    expect(mensajes[1]).toBe(otro);
    expect(queryClient.getQueryData<ChatMensaje[]>(fijadosQueryKey(10, 5))![0].encuesta).toEqual(nueva);
  });

  it('useVotePoll manda las opciones y deja los resultados nuevos en la cache', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje({ encuesta: encuesta() })]);
    const nueva = encuesta({ opciones: [{ idOpcion: 11, texto: 'Lunes', votos: [{ idUsuario: 9 }] }] });
    servicios.votePoll.mockResolvedValue(nueva);

    const { result } = renderHook(() => useVotePoll(10, 5), { wrapper });
    await act(() => result.current.mutateAsync({ idMensaje: 7, idsOpciones: [11] }));

    expect(servicios.votePoll).toHaveBeenCalledWith(10, 5, 7, [11]);
    expect(queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))![0].encuesta).toEqual(nueva);
  });

  it('useClosePoll cierra y actualiza la cache', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje({ encuesta: encuesta() })]);
    servicios.closePoll.mockResolvedValue(encuesta({ cerradaEn: '2026-11-01T00:00:00Z' }));

    const { result } = renderHook(() => useClosePoll(10, 5), { wrapper });
    await act(() => result.current.mutateAsync(7));

    expect(servicios.closePoll).toHaveBeenCalledWith(10, 5, 7);
    expect(queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))![0].encuesta?.cerradaEn).not.toBeNull();
  });

  it('useSendVoiceNote y useCreatePoll agregan el mensaje una sola vez', async () => {
    const { queryClient, wrapper } = setup();
    const nuevo = mensaje({ idMensaje: 20, contenido: '' });
    servicios.sendVoiceNote.mockResolvedValue(nuevo);
    servicios.createPoll.mockResolvedValue(nuevo);
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje()]);
    const audio = new Blob(['x'], { type: 'audio/webm' });

    const voz = renderHook(() => useSendVoiceNote(10, 5), { wrapper });
    await act(() => voz.result.current.mutateAsync({ audio, duracionSegundos: 12 }));
    const encuestaHook = renderHook(() => useCreatePoll(10, 5), { wrapper });
    await act(() => encuestaHook.result.current.mutateAsync({ pregunta: '?', opciones: ['a', 'b'] }));

    expect(servicios.sendVoiceNote).toHaveBeenCalledWith(10, 5, audio, 12);
    expect(queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))!.map((m) => m.idMensaje)).toEqual([7, 20]);
  });

  it('useFijados pide los fijados y usePinMessage marca el mensaje y refresca la barra', async () => {
    const { queryClient, wrapper } = setup();
    servicios.getPinned.mockResolvedValue([mensaje({ fijadoEn: '2026-11-01T00:00:00Z' })]);
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje()]);
    const { result: lista } = renderHook(() => useFijados(10, 5), { wrapper });
    await waitFor(() => expect(lista.current.fijados).toHaveLength(1));

    servicios.setPinned.mockResolvedValue(mensaje({ fijadoEn: '2026-11-01T01:00:00Z' }));
    servicios.getPinned.mockResolvedValue([]);
    const { result } = renderHook(() => usePinMessage(10, 5), { wrapper });
    await act(() => result.current.mutateAsync({ idMensaje: 7, fijar: true }));

    expect(servicios.setPinned).toHaveBeenCalledWith(10, 5, 7, true);
    expect(queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))![0].fijadoEn).toBe('2026-11-01T01:00:00Z');
    await waitFor(() => expect(lista.current.fijados).toHaveLength(0));
  });
});

describe('socket: resultados de encuesta en vivo y fijados', () => {
  function fakeSocket() {
    const handlers = new Map<string, (payload: unknown) => void>();
    const emitWithAck = vi.fn().mockResolvedValue({ joined: true });
    return {
      on: vi.fn((evento: string, fn: (payload: unknown) => void) => handlers.set(evento, fn)),
      off: vi.fn(),
      close: vi.fn(),
      emit: vi.fn(),
      emitWithAck,
      timeout: vi.fn(() => ({ emitWithAck })),
      __emit: (evento: string, payload: unknown) => handlers.get(evento)?.(payload),
    };
  }

  it('pollUpdated actualiza la encuesta del mensaje sin refetch y se desuscribe al desmontar', async () => {
    const socket = fakeSocket();
    mockIo.mockReturnValue(socket);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(conversationMessagesQueryKey(10, 5), [mensaje({ encuesta: encuesta() })]);
    const { unmount } = renderHook(() => useGlobalChatSocket([5]), { wrapper });
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('pollUpdated', expect.any(Function)));

    const nueva = encuesta({ opciones: [{ idOpcion: 11, texto: 'Lunes', votos: [{ idUsuario: 4 }, { idUsuario: 5 }] }] });
    act(() => socket.__emit('pollUpdated', { idConversacion: 5, idMensaje: 7, encuesta: nueva }));

    expect(queryClient.getQueryData<ChatMensaje[]>(conversationMessagesQueryKey(10, 5))![0].encuesta).toEqual(nueva);
    unmount();
    expect(socket.off).toHaveBeenCalledWith('pollUpdated', expect.any(Function));
  });

  it('messageUpdated (fijar o desfijar) refresca la barra de fijados de esa conversacion', async () => {
    const socket = fakeSocket();
    mockIo.mockReturnValue(socket);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(fijadosQueryKey(10, 5), []);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useGlobalChatSocket([5]), { wrapper });
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('messageUpdated', expect.any(Function)));

    act(() => socket.__emit('messageUpdated', { idConversacion: 5, mensaje: mensaje({ fijadoEn: '2026-11-01T00:00:00Z' }) }));

    expect(invalidar).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    expect(queryClient.getQueryState(fijadosQueryKey(10, 5))?.isInvalidated).toBe(true);
  });
});
