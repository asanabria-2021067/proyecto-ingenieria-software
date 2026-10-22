'use client';

import { useQuery } from '@tanstack/react-query';
import { getMencionables, type Mencionable } from '@/lib/services/comments';
import { projectMentionablesQueryKey } from '@/lib/query-keys/comments';

/**
 * HU-200 (T-376): integrantes que se pueden mencionar con @ en el proyecto.
 * Es la misma regla que el backend aplica al guardar, así que lo que sugiere
 * el autocompletado nunca termina degradado a texto.
 */
export function useProjectMentionables(idProyecto: number, enabled = true) {
  return useQuery<Mencionable[]>({
    queryKey: projectMentionablesQueryKey(idProyecto),
    queryFn: () => getMencionables(idProyecto),
    enabled: enabled && Number.isInteger(idProyecto) && idProyecto > 0,
    staleTime: 60 * 1000,
  });
}
