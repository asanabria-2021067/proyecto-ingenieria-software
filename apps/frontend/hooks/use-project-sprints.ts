'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectSprintsQueryKey, sprintDetailQueryKey } from '@/lib/query-keys/sprints';
import {
  closeSprint,
  finalizeSprint,
  getProjectSprints,
  getSprintDetail,
  startSprint,
} from '@/lib/services/sprints';
import type { SprintDetailDto, SprintDto } from '@/lib/types/sprints';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/** Mismo predicado que `isValidProjectId`, con nombre genérico porque F4 lo aplica también a `idSprint`. */
function isValidId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
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

/**
 * Detalle histórico de un único Sprint (F4) — `GET /proyectos/:id/sprints/:sprintId`.
 * Read-only: a diferencia de las mutations anteriores, este hook no expone
 * ninguna invalidación propia porque no muta nada; F4 nunca reabre ni edita
 * un Sprint desde esta pantalla.
 */
export function useSprintDetail(idProyecto: number, idSprint: number) {
  const enabled = isValidId(idProyecto) && isValidId(idSprint);

  const query = useQuery<SprintDetailDto>({
    queryKey: sprintDetailQueryKey(idProyecto, idSprint),
    queryFn: () => getSprintDetail(idProyecto, idSprint),
    enabled,
  });

  return {
    detail: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
