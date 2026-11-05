'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getEstadoDe, getHilo, sendRespuesta } from '@/lib/services/chat';
import { registrarRespuesta } from '@/lib/chat-hilos';
import { estadoDeQueryKey, hiloQueryKey } from '@/lib/query-keys/chat';
import type { ChatMensaje } from '@/lib/types/chat';

const PAGINA_HILO = 30;

/** MEJ-131: respuestas de un mensaje (las 30 más recientes); las anteriores se anteponen con `cargarAnteriores`. */
export function useHilo(idProyecto: number, idConversacion: number, idMensaje: number) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: hiloQueryKey(idProyecto, idConversacion, idMensaje),
    queryFn: () => getHilo(idProyecto, idConversacion, idMensaje),
  });
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [hayAnteriores, setHayAnteriores] = useState(true);
  const respuestas = query.data ?? [];

  const cargarAnteriores = useCallback(async () => {
    const key = hiloQueryKey(idProyecto, idConversacion, idMensaje);
    const actuales = queryClient.getQueryData<ChatMensaje[]>(key) ?? [];
    if (actuales.length === 0) return;
    setCargandoAnteriores(true);
    try {
      const previas = await getHilo(idProyecto, idConversacion, idMensaje, actuales[0].idMensaje);
      setHayAnteriores(previas.length >= PAGINA_HILO);
      if (previas.length > 0) queryClient.setQueryData<ChatMensaje[]>(key, (c) => [...previas, ...(c ?? [])]);
    } finally {
      setCargandoAnteriores(false);
    }
  }, [queryClient, idProyecto, idConversacion, idMensaje]);

  return {
    respuestas,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    // Con una página completa puede haber más antiguas; con menos, ya está todo el hilo.
    puedeCargarAnteriores: hayAnteriores && respuestas.length >= PAGINA_HILO,
    cargarAnteriores,
    cargandoAnteriores,
  };
}

export function useResponderHilo(idProyecto: number, idConversacion: number, idMensaje: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contenido: string) => sendRespuesta(idProyecto, idConversacion, idMensaje, contenido),
    onSuccess: (respuesta) => {
      registrarRespuesta(queryClient, { ...respuesta, idMensajePadre: respuesta.idMensajePadre ?? idMensaje });
      queryClient.invalidateQueries({ queryKey: ['chats-global'] });
    },
  });
}

/** MEJ-132: estado de otra persona (visible solo si compartes una conversación con ella). */
export function useEstadoDe(idUsuario: number | null) {
  const query = useQuery({
    queryKey: estadoDeQueryKey(idUsuario ?? 0),
    queryFn: () => getEstadoDe(idUsuario as number),
    enabled: idUsuario != null,
    staleTime: 30_000,
  });
  return { estado: query.data ?? null };
}
