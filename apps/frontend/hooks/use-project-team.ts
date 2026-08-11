'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { projectMembersQueryKey } from '@/lib/query-keys/members';
import type { ParticipacionActivaDTO } from '@/lib/dto/member.dto';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Mismo endpoint y misma query key que `useProjectMembers` (GET
 * /proyectos/:id/equipo, `projectMembersQueryKey`) — comparten caché a
 * propósito, no es una petición duplicada. A diferencia de ese hook, este no
 * aplana la respuesta: la tabla de integrantes (HU-123/T-107) necesita
 * fechaIngreso, estadoParticipacion, tareasActivas y horasRegistradas,
 * campos que useProjectMembers descarta porque su consumidor (el selector
 * de asignación de tareas) no los necesita.
 */
export function useProjectTeam(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<ParticipacionActivaDTO[]>({
    queryKey: projectMembersQueryKey(idProyecto),
    queryFn: () => apiFetch<ParticipacionActivaDTO[]>(`/proyectos/${idProyecto}/equipo`),
    enabled,
  });

  return {
    equipo: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
