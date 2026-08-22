'use client';

import { useEffect, useRef } from 'react';
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
import { getAccessToken } from '@/lib/utils/token';

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

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    // Mismo criterio que useRealtimeNotifications: el esquema ws/wss sigue
    // el protocolo real de la página, no el prefijo de NEXT_PUBLIC_API_URL.
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = apiUrl.replace(/^https?/, wsScheme);
    const socket = io(`${wsUrl}/chat`, {
      auth: { token },
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
      queryClient.setQueryData<ChatMensaje[]>(
        conversationMessagesQueryKey(idProyecto, idConversacion),
        (current) => {
          if (!current) return current;
          if (current.some((m) => m.idMensaje === mensaje.idMensaje)) return current;
          return [...current, mensaje];
        },
      );
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
      if (activeConversationIdRef.current != null) {
        socket.emit('joinConversation', { idConversacion: activeConversationIdRef.current });
      }
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('conversationUpdated', handleConversationUpdated);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('conversationUpdated', handleConversationUpdated);
      socket.off('connect', handleConnect);
      socket.close();
      socketRef.current = null;
    };
  }, [idProyecto, queryClient]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || activeConversationId == null) return;

    socket.emit('joinConversation', { idConversacion: activeConversationId });
    return () => {
      socket.emit('leaveConversation', { idConversacion: activeConversationId });
    };
  }, [activeConversationId]);
}
