'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { updateEstadoPostulacion } from '@/lib/services/applications';
import { projectPendingPostulationsQueryKey } from '@/lib/query-keys/applications';
import { projectTeamSummaryQueryKey } from '@/lib/query-keys/members';
import type { PostulacionRecibida } from '@/types';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * F13 — `GET /proyectos/:id/miembros/postulaciones-pendientes` (B13,
 * `TeamService.getPendingPostulations`). Fuente única: ese endpoint ya
 * reutiliza `ApplicationsService.findAll` filtrado a `PENDIENTE` del
 * proyecto — este hook no vuelve a filtrar ni recalcula esa clasificación.
 *
 * Independiente de `useProjectTeam` (query propia, `enabled` propio): un
 * fallo o loading aquí no debe tumbar las tres secciones de F12.
 */
export function useProjectPendingPostulations(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<PostulacionRecibida[]>({
    queryKey: projectPendingPostulationsQueryKey(idProyecto),
    queryFn: () => apiFetch<PostulacionRecibida[]>(`/proyectos/${idProyecto}/miembros/postulaciones-pendientes`),
    enabled,
  });

  return {
    postulaciones: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

interface ResolverPostulacionInput {
  postulacionId: number;
  estadoPostulacion: 'ACEPTADA' | 'RECHAZADA';
  comentarioResolucion?: string;
}

/**
 * `PATCH /postulaciones/:id/estado` — endpoint YA EXISTENTE del dominio
 * `applications/` (`ApplicationsService.updateEstado`), el mismo que usa
 * `app/dashboard/proyectos/[id]/postulaciones/page.tsx`. F13 no crea una
 * segunda implementación de resolución: solo la envuelve en una mutation
 * reutilizable desde `PendingPostulationsCard`.
 *
 * Invalidaciones: siempre `pending-postulations` en `onSettled`, tanto en
 * éxito como en error — si otro líder ya resolvió esta postulación (o
 * cualquier otro conflicto server-side), la próxima lectura reconcilia con
 * el servidor en vez de dejar una fila fantasma como PENDIENTE. `ACEPTADA`
 * además crea/reactiva una `ParticipacionProyecto` (ver `create-postulacion`
 * → participación del postulante), así que el resumen person-centric de F12
 * (`projectTeamSummaryQueryKey`) también queda obsoleto; `RECHAZADA` no toca
 * el equipo, así que esa query no se invalida en ese caso.
 */
export function useResolvePostulacion(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postulacionId, estadoPostulacion, comentarioResolucion }: ResolverPostulacionInput) =>
      updateEstadoPostulacion(postulacionId, { estadoPostulacion, comentarioResolucion }),
    onSuccess: (_data, variables) => {
      if (variables.estadoPostulacion === 'ACEPTADA') {
        queryClient.invalidateQueries({ queryKey: projectTeamSummaryQueryKey(idProyecto) });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectPendingPostulationsQueryKey(idProyecto) });
    },
  });
}
