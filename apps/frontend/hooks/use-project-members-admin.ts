'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/**
 * Consume el endpoint nuevo `GET /proyectos/:id/miembros`
 * (`ProjectsController.findMembers`, apps/backend/src/projects/projects.controller.ts),
 * distinto de `/equipo` que usa `useProjectMembers`
 * (apps/frontend/hooks/use-project-members.ts): este trae todos los
 * estados de participación y `horasRegistradas`, para la vista de
 * administración de miembros.
 */
export type EstadoParticipacion = 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';

export interface MiembroAdminDTO {
  idParticipacion: number;
  estadoParticipacion: EstadoParticipacion;
  fechaIngreso: string;
  horasRegistradas: number;
  usuario: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    correo: string;
    fotoUrl: string | null;
  };
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
    descripcionRolProyecto: string | null;
  };
}

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

export const projectMembersAdminQueryKey = (idProyecto: number) =>
  ['proyecto-miembros', idProyecto] as const;

export function useProjectMembersAdmin(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<MiembroAdminDTO[]>({
    queryKey: projectMembersAdminQueryKey(idProyecto),
    queryFn: () => apiFetch<MiembroAdminDTO[]>(`/proyectos/${idProyecto}/miembros`),
    enabled,
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
