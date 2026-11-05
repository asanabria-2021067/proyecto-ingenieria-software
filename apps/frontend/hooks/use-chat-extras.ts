'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closePoll,
  createPoll,
  createReminder,
  getPinned,
  getPinnedOrganizacion,
  resolveCards,
  sendVoiceNote,
  setPinned,
  setPinnedOrganizacion,
  votePoll,
} from '@/lib/services/chat-extras';
import { actualizarEncuestaEnCache, fijadosQueryKey, refrescarFijados } from '@/lib/chat-extras';
import { conversationFilesQueryKey, conversationMessagesQueryKey } from '@/lib/query-keys/chat';
import type { ChatMensaje, CrearEncuestaPayload } from '@/lib/types/chat';

/** Notas de voz (MEJ-41), encuestas (MEJ-42) y fijados (MEJ-43) del chat de proyecto. */

function useAgregarMensaje(idProyecto: number, idConversacion: number) {
  const queryClient = useQueryClient();
  return (mensaje: ChatMensaje) => {
    queryClient.setQueryData<ChatMensaje[]>(conversationMessagesQueryKey(idProyecto, idConversacion), (actual) =>
      !actual ? [mensaje] : actual.some((m) => m.idMensaje === mensaje.idMensaje) ? actual : [...actual, mensaje],
    );
    if (mensaje.adjunto) queryClient.invalidateQueries({ queryKey: conversationFilesQueryKey(idProyecto, idConversacion) });
    queryClient.invalidateQueries({ queryKey: ['chats-global'] });
  };
}

export function useSendVoiceNote(idProyecto: number, idConversacion: number) {
  const agregar = useAgregarMensaje(idProyecto, idConversacion);
  return useMutation({
    mutationFn: ({ audio, duracionSegundos }: { audio: Blob; duracionSegundos: number }) =>
      sendVoiceNote(idProyecto, idConversacion, audio, duracionSegundos),
    onSuccess: agregar,
  });
}

export function useCreatePoll(idProyecto: number, idConversacion: number) {
  const agregar = useAgregarMensaje(idProyecto, idConversacion);
  return useMutation({
    mutationFn: (payload: CrearEncuestaPayload) => createPoll(idProyecto, idConversacion, payload),
    onSuccess: agregar,
  });
}

export function useVotePoll(idProyecto: number, idConversacion: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idMensaje, idsOpciones }: { idMensaje: number; idsOpciones: number[] }) =>
      votePoll(idProyecto, idConversacion, idMensaje, idsOpciones),
    onSuccess: (encuesta, { idMensaje }) => actualizarEncuestaEnCache(queryClient, idConversacion, idMensaje, encuesta),
  });
}

export function useClosePoll(idProyecto: number, idConversacion: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idMensaje: number) => closePoll(idProyecto, idConversacion, idMensaje),
    onSuccess: (encuesta, idMensaje) => actualizarEncuestaEnCache(queryClient, idConversacion, idMensaje, encuesta),
  });
}

/** MEJ-45: tarjetas de los enlaces internos de un mensaje; cada ruta se resuelve una sola vez por sesion. */
export function useTarjetasEnlace(idProyecto: number, idConversacion: number, rutas: string[]) {
  const query = useQuery({
    queryKey: ['chat-tarjetas', idProyecto, idConversacion, rutas],
    queryFn: () => resolveCards(idProyecto, idConversacion, rutas),
    enabled: rutas.length > 0,
    staleTime: 60_000,
  });
  return { tarjetas: query.data ?? [], isLoading: query.isLoading };
}

export function useCreateReminder(idProyecto: number, idConversacion: number) {
  return useMutation({
    mutationFn: ({ idMensaje, recordarEn }: { idMensaje: number; recordarEn: string }) =>
      createReminder(idProyecto, idConversacion, idMensaje, recordarEn),
  });
}

export function useFijados(idProyecto: number, idConversacion: number) {
  const query = useQuery({
    queryKey: fijadosQueryKey(idProyecto, idConversacion),
    queryFn: () => getPinned(idProyecto, idConversacion),
  });
  return { fijados: query.data ?? [], isLoading: query.isLoading };
}

/** Chat de la organización (idProyecto 0 en las claves): mismos fijados, otra API. */
export function useFijadosOrganizacion(idOrganizacion: number, idConversacion: number | null) {
  const query = useQuery({
    queryKey: fijadosQueryKey(0, idConversacion ?? 0),
    queryFn: () => getPinnedOrganizacion(idOrganizacion),
    enabled: idConversacion != null,
    // Misma razón que los mensajes de la organización: la sala del canal puede no estar unida al socket.
    refetchInterval: 10_000,
  });
  return { fijados: query.data ?? [], isLoading: query.isLoading };
}

export function usePinMessageOrganizacion(idOrganizacion: number, idConversacion: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idMensaje, fijar }: { idMensaje: number; fijar: boolean }) =>
      setPinnedOrganizacion(idOrganizacion, idMensaje, fijar),
    onSuccess: (mensaje) => {
      queryClient.setQueryData<ChatMensaje[]>(conversationMessagesQueryKey(0, idConversacion ?? 0), (actual) =>
        actual?.map((m) => (m.idMensaje === mensaje.idMensaje ? { ...m, fijadoEn: mensaje.fijadoEn } : m)),
      );
      refrescarFijados(queryClient, idConversacion ?? 0);
    },
  });
}

export function usePinMessage(idProyecto: number, idConversacion: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idMensaje, fijar }: { idMensaje: number; fijar: boolean }) =>
      setPinned(idProyecto, idConversacion, idMensaje, fijar),
    onSuccess: (mensaje) => {
      queryClient.setQueryData<ChatMensaje[]>(conversationMessagesQueryKey(idProyecto, idConversacion), (actual) =>
        actual?.map((m) => (m.idMensaje === mensaje.idMensaje ? { ...m, fijadoEn: mensaje.fijadoEn } : m)),
      );
      refrescarFijados(queryClient, idConversacion);
    },
  });
}
