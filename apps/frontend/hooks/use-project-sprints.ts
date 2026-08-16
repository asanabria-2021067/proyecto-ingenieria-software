'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectSprintsQueryKey } from '@/lib/query-keys/sprints';
import { closeSprint, finalizeSprint, getProjectSprints, startSprint } from '@/lib/services/sprints';
import type { SprintDto } from '@/lib/types/sprints';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Lista de Sprints del proyecto — `GET /proyectos/:id/sprints`. No deriva
 * ni reordena nada: el backend ya entrega la lista ordenada por
 * `numero: desc` (SprintsService.listSprints).
 */
export function useProjectSprints(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<SprintDto[]>({
    queryKey: projectSprintsQueryKey(idProyecto),
    queryFn: () => getProjectSprints(idProyecto),
    enabled,
  });

  return {
    sprints: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Inicia un Sprint — `POST /proyectos/:id/sprints`. Ni `finalizeSprint` ni
 * `closeSprint` tocan ninguna fila de `Tarea` (ver sprints.service.ts: A9
 * nunca las selecciona/actualiza), así que la única query que queda
 * obsoleta tras cualquiera de las tres transiciones es la propia lista de
 * Sprints del proyecto — no hay causa contractual para invalidar
 * `project-tasks` ni `project-avance` desde este hook.
 */
export function useStartSprint(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startSprint(idProyecto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectSprintsQueryKey(idProyecto) });
    },
  });
}

/** Transición ACTIVO -> EN_FINALIZACION — `POST /proyectos/:id/sprints/:sprintId/finalizar`. */
export function useFinalizeSprint(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (idSprint: number) => finalizeSprint(idProyecto, idSprint),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectSprintsQueryKey(idProyecto) });
    },
  });
}

/** Transición EN_FINALIZACION -> CERRADO — `POST /proyectos/:id/sprints/:sprintId/cerrar`. */
export function useCloseSprint(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (idSprint: number) => closeSprint(idProyecto, idSprint),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectSprintsQueryKey(idProyecto) });
    },
  });
}
