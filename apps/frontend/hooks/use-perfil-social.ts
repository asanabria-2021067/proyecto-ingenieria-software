'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RUTA_MENSAJES } from '@/components/chat-dock/chat-dock-context';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { aviso } from '@/lib/mensajes';
import { abrirMensajeDirecto, getActividadReciente, getCvProyectos, getPerfilResumen } from '@/lib/services/perfil-social';

export const perfilResumenQueryKey = (id: number) => ['perfil-social', id, 'resumen'] as const;

export function usePerfilResumen(id: number) {
  return useQuery({ queryKey: perfilResumenQueryKey(id), queryFn: () => getPerfilResumen(id), enabled: id > 0 });
}

export function useActividadReciente(id: number) {
  return useQuery({ queryKey: ['perfil-social', id, 'actividad'], queryFn: () => getActividadReciente(id), enabled: id > 0 });
}

export function useCvProyectos(id: number) {
  return useQuery({ queryKey: ['perfil-social', id, 'cv'], queryFn: () => getCvProyectos(id), enabled: id > 0 });
}

/** MEJ-28: «Enviar mensaje» abre (o crea) la conversación individual con un amigo y navega a ella. */
export function useEnviarMensaje(idAmigo: number) {
  const router = useRouter();
  return useMutation({
    mutationFn: () => abrirMensajeDirecto(idAmigo),
    onSuccess: ({ idConversacion }) => router.push(`${RUTA_MENSAJES}/${idConversacion}`),
    onError: (error) => aviso.error('No se pudo abrir la conversación', mensajeErrorOrganizacion(error)),
  });
}
