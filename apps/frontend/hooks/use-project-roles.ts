'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectTasksQueryKey, projectAvanceQueryKey } from '@/lib/query-keys/tasks';
import { projectMembersQueryKey } from '@/hooks/use-project-members';
import {
  createProjectRole,
  deleteProjectRole,
  getProjectRoles,
  leaveRole,
  selfAssignRole,
  updateProjectRole,
  type CreateRoleInput,
  type ProjectRolesResponse,
  type UpdateRoleInput,
} from '@/lib/services/roles';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Clave canónica de roles del proyecto. Se co-ubica con su único dueño (mismo
 * criterio que `projectLabelsQueryKey`). Forma: `['project-roles', idProyecto]`.
 */
export const projectRolesQueryKey = (idProyecto: number) =>
  ['project-roles', idProyecto] as const;

/** Clave del detalle del proyecto — misma forma que `useProjectDetail` (`['project', id]`). */
const projectDetailQueryKey = (idProyecto: number) => ['project', idProyecto] as const;

/**
 * Capa de datos de roles/participación. Las mutaciones invalidan según la
 * Sección 57: autoasignarse a un rol → proyecto, roles, participaciones,
 * candidatos y resumen del equipo; abandonar un rol → además tareas y avance
 * (una tarea del rol pudo quedar sin asignado).
 */
export function useProjectRoles(idProyecto: number, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = isValidProjectId(idProyecto) && (options?.enabled ?? true);

  const query = useQuery<ProjectRolesResponse>({
    queryKey: projectRolesQueryKey(idProyecto),
    queryFn: () => getProjectRoles(idProyecto),
    enabled,
  });

  const invalidate = (keys: readonly (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  // Roles + proyecto + equipo/participaciones/candidatos + resumen del equipo.
  const invalidateRolesYEquipo = () =>
    invalidate([
      projectRolesQueryKey(idProyecto),
      projectDetailQueryKey(idProyecto),
      projectMembersQueryKey(idProyecto),
    ]);

  const crearRol = useMutation({
    mutationFn: (input: CreateRoleInput) => createProjectRole(idProyecto, input),
    onSuccess: invalidateRolesYEquipo,
  });

  const editarRol = useMutation({
    mutationFn: ({ roleId, input }: { roleId: number; input: UpdateRoleInput }) =>
      updateProjectRole(idProyecto, roleId, input),
    onSuccess: invalidateRolesYEquipo,
  });

  const eliminarRol = useMutation({
    mutationFn: ({ roleId }: { roleId: number }) => deleteProjectRole(idProyecto, roleId),
    onSuccess: invalidateRolesYEquipo,
  });

  const asignarmeRol = useMutation({
    mutationFn: ({ roleId }: { roleId: number }) => selfAssignRole(idProyecto, roleId),
    onSuccess: invalidateRolesYEquipo,
  });

  const salirDeRol = useMutation({
    mutationFn: ({ roleId }: { roleId: number }) => leaveRole(idProyecto, roleId),
    onSuccess: () =>
      invalidate([
        projectRolesQueryKey(idProyecto),
        projectDetailQueryKey(idProyecto),
        projectMembersQueryKey(idProyecto),
        // Una tarea del rol abandonado pudo quedar sin asignado.
        projectTasksQueryKey(idProyecto),
        projectAvanceQueryKey(idProyecto),
      ]),
  });

  return {
    isLeader: query.data?.isLeader ?? false,
    roles: query.data?.roles ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    crearRol,
    editarRol,
    eliminarRol,
    asignarmeRol,
    salirDeRol,
  };
}
