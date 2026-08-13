'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { projectTeamSummaryQueryKey } from '@/lib/query-keys/members';
import type { ResumenEquipoProyectoDTO } from '@/lib/dto/member.dto';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Consume `GET /proyectos/:id/miembros/resumen` (T-106,
 * `ProjectsService.getTeamSummary`), la fuente canónica person-centric de
 * HU-123. No comparte caché con `useProjectMembers`/`GET /proyectos/:id/equipo`
 * — su respuesta tiene una forma distinta (`lider` + `miembros[]` agrupados
 * por `idUsuario`, no una fila por participación), por eso usa
 * `projectTeamSummaryQueryKey` en vez de `projectMembersQueryKey`.
 */
export function useProjectTeam(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<ResumenEquipoProyectoDTO>({
    queryKey: projectTeamSummaryQueryKey(idProyecto),
    queryFn: () => apiFetch<ResumenEquipoProyectoDTO>(`/proyectos/${idProyecto}/miembros/resumen`),
    enabled,
  });

  return {
    lider: query.data?.lider ?? null,
    miembros: query.data?.miembros ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
