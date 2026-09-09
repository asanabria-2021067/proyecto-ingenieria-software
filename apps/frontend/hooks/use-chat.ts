'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  getMessages,
  listConversations,
  markConversationRead,
  sendMessage,
} from '@/lib/services/chat';
import {
  conversationMessagesQueryKey,
  projectConversationsQueryKey,
} from '@/lib/query-keys/chat';
import type { ChatMensaje, CreateConversationPayload } from '@/lib/types/chat';

/**
 * 'joinConversation' es fire-and-forget salvo por este ack: sin él, un join
 * que falla (p. ej. la comprobación de ConversacionParticipante en el
 * gateway tarda o la fila aún no existe) deja al cliente creyendo que está
 * en la room `conversation:{id}` cuando en realidad nunca recibirá
 * `newMessage`. Reintenta unas pocas veces antes de rendirse.
 */
async function joinConversationReliably(
  socket: Socket,
  idConversacion: number,
  shouldAbort: () => boolean,
) {
  for (let attempt = 0; attempt < 3 && !shouldAbort(); attempt++) {
    try {
      const ack = await socket.timeout(3000).emitWithAck('joinConversation', { idConversacion });
      if (ack?.joined) return;
    } catch {
      // sin ack (timeout o desconexión): reintenta
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

export function useConversations(idProyecto: number) {
  const query = useQuery({
    queryKey: projectConversationsQueryKey(idProyecto),
    queryFn: () => listConversations(idProyecto),
    enabled: Number.isInteger(idProyecto) && idProyecto > 0,
  });
  return { conversations: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useCreateConversation(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateConversationPayload) => createConversation(idProyecto, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
    },
  });
}

export function useMessages(idProyecto: number, idConversacion: number | null) {
  const query = useQuery({
    queryKey: conversationMessagesQueryKey(idProyecto, idConversacion ?? 0),
    queryFn: () => getMessages(idProyecto, idConversacion as number),
    enabled: idConversacion != null,
  });
  return { messages: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useSendMessage(idProyecto: number, idConversacion: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contenido: string) => sendMessage(idProyecto, idConversacion as number, contenido),
    onSuccess: (mensaje) => {
      queryClient.setQueryData<ChatMensaje[]>(
        conversationMessagesQueryKey(idProyecto, idConversacion as number),
        (current) => (current ? [...current, mensaje] : [mensaje]),
      );
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
    },
  });
}

export function useMarkConversationRead(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idConversacion: number) => markConversationRead(idProyecto, idConversacion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
    },
  });
}

/**
 * Conexión al namespace /chat: se une a la room de `activeConversationId`
 * (si hay una abierta) y mantiene el historial + la lista de conversaciones
 * sincronizados en vivo. Vive solo mientras el panel de chat está montado
 * (no es una conexión global del dashboard, a diferencia de las
 * notificaciones) — se abre y cierra con el sidebar del proyecto.
 */
export function useChatSocket(idProyecto: number, activeConversationId: number | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<number | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    // Mismo criterio que useRealtimeNotifications: el esquema ws/wss sigue
    // el protocolo real de la página, no el prefijo de NEXT_PUBLIC_API_URL.
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = apiUrl.replace(/^https?/, wsScheme);
    // Sesión vía cookie httpOnly access_token (ver useRealtimeNotifications).
    const socket = io(`${wsUrl}/chat`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const handleNewMessage = ({
      idConversacion,
      mensaje,
    }: {
      idConversacion: number;
      mensaje: ChatMensaje;
    }) => {
      let huboCache = false;
      queryClient.setQueryData<ChatMensaje[]>(
        conversationMessagesQueryKey(idProyecto, idConversacion),
        (current) => {
          if (!current) return current;
          huboCache = true;
          if (current.some((m) => m.idMensaje === mensaje.idMensaje)) return current;
          return [...current, mensaje];
        },
      );
      // Sin cache previa (p. ej. la conversación se acaba de abrir y su
      // fetch inicial todavía no resuelve) no hay nada que anexar — pero
      // descartar el mensaje en silencio lo pierde para siempre si ese
      // fetch inicial ya había arrancado con datos viejos. Forzar un
      // refetch explícito de ESTA conversación en vez de confiar en que
      // projectConversationsQueryKey la invalide por accidente de prefijo.
      if (!huboCache) {
        queryClient.invalidateQueries({
          queryKey: conversationMessagesQueryKey(idProyecto, idConversacion),
        });
      }
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
    };

    const handleConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
    };

    // Las rooms de socket.io viven en la conexión, no en la cuenta: cada
    // reconexión (red inestable, proxy con idle timeout, etc.) empieza sin
    // ninguna room unida. Sin este re-join, un solo hiccup de red mata los
    // mensajes en vivo para el resto de la sesión aunque el socket siga
    // "conectado" a simple vista.
    const handleConnect = () => {
      setIsConnected(true);
      const idConversacion = activeConversationIdRef.current;
      if (idConversacion != null) {
        joinConversationReliably(socket, idConversacion, () => activeConversationIdRef.current !== idConversacion);
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('conversationUpdated', handleConversationUpdated);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('conversationUpdated', handleConversationUpdated);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.close();
      socketRef.current = null;
    };
  }, [idProyecto, queryClient]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || activeConversationId == null) return;

    let cancelado = false;
    joinConversationReliably(socket, activeConversationId, () => cancelado);
    return () => {
      cancelado = true;
      socket.emit('leaveConversation', { idConversacion: activeConversationId });
    };
  }, [activeConversationId]);

  return { isConnected };
}
