'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { projectMembersQueryKey } from '@/lib/query-keys/members';
import type { ParticipacionActivaDTO, MiembroProyecto } from '@/lib/dto/member.dto';

export type { MiembroProyecto };

/**
 * `apps/frontend/lib/services/` está protegido en esta tarea (Tarea 38,
 * sección 47); este hook llama `apiFetch` directamente para el endpoint ya
 * existente `GET /proyectos/:id/equipo` (`ProjectsController`/
 * `ProjectsService.findTeam`, apps/backend/src/projects/projects.service.ts:467-498),
 * mismo patrón ya usado por
 * apps/frontend/app/dashboard/proyectos/[id]/equipo/page.tsx (esa página no
 * pasa por una capa de servicio tampoco). No se inventa ningún endpoint.
 */
function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

export { projectMembersQueryKey };

/**
 * `findTeam` ya filtra por `estadoParticipacion: 'ACTIVO'` en el backend:
 * este hook nunca vuelve a filtrar por estado ni consulta participaciones
 * históricas.
 */
export function useProjectMembers(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<ParticipacionActivaDTO[]>({
    queryKey: projectMembersQueryKey(idProyecto),
    queryFn: () => apiFetch<ParticipacionActivaDTO[]>(`/proyectos/${idProyecto}/equipo`),
    enabled,
  });

  const members: MiembroProyecto[] = (query.data ?? []).map((p) => ({
    idUsuario: p.usuario.idUsuario,
    nombre: p.usuario.nombre,
    apellido: p.usuario.apellido,
    correo: p.usuario.correo,
    fotoUrl: p.usuario.fotoUrl,
    idRolProyecto: p.rolProyecto.idRolProyecto,
  }));

  return {
    members,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
