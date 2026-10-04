'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  deleteConversation,
  getMessages,
  listAllConversations,
  listArchivedConversations,
  markConversationRead,
  sendMessage,
  updateConversation,
} from '@/lib/services/chat';
import {
  allConversationsQueryKey,
  archivedConversationsQueryKey,
  conversationMessagesQueryKey,
  projectConversationsQueryKey,
} from '@/lib/query-keys/chat';
import type { ChatMensaje, CreateConversationPayload, UpdateConversationPayload } from '@/lib/types/chat';
import { realtimeBaseUrl } from '@/lib/realtime/socket-url';

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

/** Dock global de chat: todas las conversaciones activas del usuario, de cualquier proyecto. */
export function useAllConversations(q: string = '') {
  const query = useQuery({
    queryKey: allConversationsQueryKey(q.trim()),
    queryFn: () => listAllConversations(q.trim() || undefined),
  });
  return { conversations: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

function invalidateChatLists(queryClient: ReturnType<typeof useQueryClient>, idProyecto: number) {
  queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
  queryClient.invalidateQueries({ queryKey: ['chats-global'] });
}

export function useCreateConversation(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateConversationPayload) => createConversation(idProyecto, payload),
    onSuccess: () => invalidateChatLists(queryClient, idProyecto),
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
      invalidateChatLists(queryClient, idProyecto);
    },
  });
}

/** T-236: paginado, con búsqueda por nombre de chat o por persona (el `q`
 * viaja tal cual al backend, que compara contra ambos). */
export function useArchivedConversations(q: string) {
  const query = useInfiniteQuery({
    queryKey: archivedConversationsQueryKey(q.trim()),
    queryFn: ({ pageParam }) => listArchivedConversations({ q: q.trim() || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
  });
  return {
    conversaciones: query.data?.pages.flatMap((p) => p.items) ?? [],
    hasMore: Boolean(query.hasNextPage),
    isLoading: query.isLoading,
    isError: query.isError,
    cargarMas: () => query.fetchNextPage(),
    cargandoMas: query.isFetchingNextPage,
  };
}

/** Menú del dock de chat: archivar, renombrar, favorito, silenciar o prioridad. */
export function useUpdateConversation(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idConversacion, payload }: { idConversacion: number; payload: UpdateConversationPayload }) =>
      updateConversation(idProyecto, idConversacion, payload),
    onSuccess: () => invalidateChatLists(queryClient, idProyecto),
  });
}

export function useDeleteConversation(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idConversacion: number) => deleteConversation(idProyecto, idConversacion),
    onSuccess: () => invalidateChatLists(queryClient, idProyecto),
  });
}

export function useMarkConversationRead(idProyecto: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idConversacion: number) => markConversationRead(idProyecto, idConversacion),
    onSuccess: () => invalidateChatLists(queryClient, idProyecto),
  });
}

/**
 * Conexión global al namespace /chat para el dock de chat (estilo LinkedIn):
 * una sola conexión para todo el dashboard (no una por proyecto). Se une a
 * la room de cada conversación con una ventana abierta (`openConversationIds`)
 * para recibir `newMessage` en vivo sin refetch, y a `conversationUpdated`
 * (emitido automáticamente a `user:{id}` por el gateway) para refrescar la
 * lista global aunque la conversación que cambió no tenga ventana abierta.
 */
export function useGlobalChatSocket(openConversationIds: number[]) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const openIdsRef = useRef<number[]>(openConversationIds);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    openIdsRef.current = openConversationIds;
  }, [openConversationIds]);

  useEffect(() => {
    const wsUrl = realtimeBaseUrl(process.env.NEXT_PUBLIC_API_URL, window.location);
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
      queryClient.setQueriesData<ChatMensaje[]>(
        { predicate: (query) => query.queryKey[0] === 'proyecto-conversaciones' && query.queryKey[2] === idConversacion && query.queryKey[3] === 'mensajes' },
        (current) => {
          if (!current) return current;
          huboCache = true;
          if (current.some((m) => m.idMensaje === mensaje.idMensaje)) return current;
          return [...current, mensaje];
        },
      );
      if (!huboCache) {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'proyecto-conversaciones' && query.queryKey[2] === idConversacion && query.queryKey[3] === 'mensajes',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['chats-global'] });
    };

    const handleConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['chats-global'] });
      queryClient.invalidateQueries({ queryKey: ['proyecto-conversaciones'] });
    };

    // Las rooms de socket.io viven en la conexión, no en la cuenta: cada
    // reconexión (red inestable, proxy con idle timeout, etc.) empieza sin
    // ninguna room unida. Sin este re-join, un solo hiccup de red mata los
    // mensajes en vivo para el resto de la sesión aunque el socket siga
    // "conectado" a simple vista.
    const handleConnect = () => {
      setIsConnected(true);
      // T-333: tras una reconexión puede haber mensajes o actualizaciones
      // que no llegaron por el socket; se vuelven a pedir las ventanas
      // abiertas y la lista global en vez de esperar un recargo de página.
      queryClient.invalidateQueries({ queryKey: ['chats-global'] });
      for (const idConversacion of openIdsRef.current) {
        joinConversationReliably(socket, idConversacion, () => !openIdsRef.current.includes(idConversacion));
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
  }, [queryClient]);

  // Une/abandona rooms según qué ventanas de chat están abiertas ahora mismo.
  const idsKey = openConversationIds.join(',');
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    let cancelado = false;
    for (const idConversacion of ids) {
      joinConversationReliably(socket, idConversacion, () => cancelado);
    }
    return () => {
      cancelado = true;
      for (const idConversacion of ids) {
        socket.emit('leaveConversation', { idConversacion });
      }
    };
  }, [idsKey]);

  return { isConnected };
}
