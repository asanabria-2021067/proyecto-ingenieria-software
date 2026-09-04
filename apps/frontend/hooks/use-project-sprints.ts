'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  projectSprintsQueryKey,
  sprintAnalyticsQueryKey,
  sprintClosingSummaryQueryKey,
  sprintDetailQueryKey,
  sprintsAnalyticsQueryKey,
} from '@/lib/query-keys/sprints';
import {
  adjustSprintHours,
  closeSprint,
  finalizeSprint,
  getProjectSprints,
  getSprintAnalytics,
  getSprintClosingSummary,
  getSprintDetail,
  getSprintsAnalytics,
  startSprint,
} from '@/lib/services/sprints';
import type {
  AdjustSprintHoursInput,
  SprintAnalyticsDto,
  SprintClosingSummaryDto,
  SprintComparativeAnalyticsDto,
  SprintDetailDto,
  SprintDto,
} from '@/lib/types/sprints';

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

/**
 * SprintClosingSummary (F5) — `GET /proyectos/:id/sprints/:sprintId/resumen-cierre`.
 * Read-only, mismo patrón que `useSprintDetail`: no expone invalidación
 * propia porque no muta nada.
 */
export function useSprintClosingSummary(idProyecto: number, idSprint: number) {
  const enabled = isValidId(idProyecto) && isValidId(idSprint);

  const query = useQuery<SprintClosingSummaryDto>({
    queryKey: sprintClosingSummaryQueryKey(idProyecto, idSprint),
    queryFn: () => getSprintClosingSummary(idProyecto, idSprint),
    enabled,
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Ajusta horas reconocidas de una participación (A7) —
 * `PATCH /proyectos/:id/sprints/:sprintId/horas/:idParticipacion`. Opera
 * sobre una `ParticipacionProyecto` concreta, nunca sobre una persona
 * agregada (F5 puede necesitar invocarla varias veces, una por cada
 * participación realmente modificada de un participante multirol).
 *
 * `SprintDetail` (F4) nunca lee `HorasParticipacion` — sus asignaciones solo
 * exponen `horasReales` de `AsignacionTarea`, una tabla distinta que A7
 * jamás toca — así que no hay causa contractual para invalidarlo aquí; solo
 * `SprintClosingSummary` queda obsoleto tras un ajuste exitoso.
 */
export function useAdjustSprintHours(idProyecto: number, idSprint: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      idParticipacion,
      ...input
    }: { idParticipacion: number } & AdjustSprintHoursInput) =>
      adjustSprintHours(idProyecto, idSprint, idParticipacion, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sprintClosingSummaryQueryKey(idProyecto, idSprint),
      });
    },
  });
}

/**
 * Analítica individual de un Sprint (T-172) — `GET /proyectos/:id/sprints/:sprintId/analytics`.
 * Read-only, mismo patrón que `useSprintDetail`/`useSprintClosingSummary`:
 * sin invalidación propia porque no muta nada.
 */
export function useSprintAnalytics(idProyecto: number, idSprint: number) {
  const enabled = isValidId(idProyecto) && isValidId(idSprint);

  const query = useQuery<SprintAnalyticsDto>({
    queryKey: sprintAnalyticsQueryKey(idProyecto, idSprint),
    queryFn: () => getSprintAnalytics(idProyecto, idSprint),
    enabled,
  });

  return {
    analytics: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Analítica comparativa entre Sprints del proyecto (T-173) — `GET /proyectos/:id/sprints/analytics`.
 * Read-only, mismo patrón que `useSprintAnalytics`.
 */
export function useSprintsAnalytics(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<SprintComparativeAnalyticsDto>({
    queryKey: sprintsAnalyticsQueryKey(idProyecto),
    queryFn: () => getSprintsAnalytics(idProyecto),
    enabled,
  });

  return {
    sprints: query.data?.sprints ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
