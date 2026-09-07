'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRegistroYaRevocado } from '@/components/projects/api-error';
import {
  projectAvanceQueryKey,
  projectTasksQueryKey,
  taskHoursQueryKey,
  taskHoursSummaryQueryKey,
} from '@/lib/query-keys/tasks';
import {
  getHorasTarea,
  getTaskHoursSummary,
  registrarHorasTarea,
  revokeTimeRecord,
  updateTimeRecord,
} from '@/lib/services/task-hours';
import type {
  CreateTimeRecordInput,
  RegistroTiempoTareaDTO,
  TaskHoursSummaryDTO,
  UpdateTimeRecordInput,
} from '@/lib/types/tasks';

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Decide si una operación de horas cruza la estimación de la tarea
 * (06 v2 §10, C065): `antes ≤ estimación ∧ después > estimación`. Con
 * estimación nula no hay umbral y nunca se exige justificación. Reducir o
 * revocar jamás cumple el predicado.
 *
 * `antes` es el total reportado de la tarea (string decimal del backend) y
 * `delta` el cambio que introduce la operación (positivo al registrar, la
 * diferencia al editar). Se opera en centésimas enteras para no depender
 * de aritmética de punto flotante.
 */
export function crossesEstimate(
  antes: string,
  delta: number,
  estimacion: number | null,
): boolean {
  if (estimacion == null) return false;
  const antesC = Math.round(Number(antes) * 100);
  const deltaC = Math.round(delta * 100);
  const estimacionC = Math.round(estimacion * 100);
  if (!Number.isFinite(antesC) || !Number.isFinite(deltaC)) return false;
  const despuesC = antesC + deltaC;
  return antesC <= estimacionC && despuesC > estimacionC;
}

/**
 * VIEW-04 (F001) — lista de registros + resumen autoritativo de horas de una
 * tarea, y las tres mutations (registrar, editar, revocar). Las
 * invalidaciones son siempre las mismas tres queries más `project-avance`
 * (el detalle de tarea ya la invalidaba al registrar).
 */
export function useTaskHours(idProyecto: number, idTarea: number, enabled = true) {
  const queryClient = useQueryClient();
  const activo = enabled && isValidId(idProyecto) && isValidId(idTarea);

  const recordsQuery = useQuery<RegistroTiempoTareaDTO[]>({
    queryKey: taskHoursQueryKey(idProyecto, idTarea),
    queryFn: () => getHorasTarea(idProyecto, idTarea),
    enabled: activo,
  });

  const summaryQuery = useQuery<TaskHoursSummaryDTO>({
    queryKey: taskHoursSummaryQueryKey(idProyecto, idTarea),
    queryFn: () => getTaskHoursSummary(idProyecto, idTarea),
    enabled: activo,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: taskHoursQueryKey(idProyecto, idTarea) });
    queryClient.invalidateQueries({ queryKey: taskHoursSummaryQueryKey(idProyecto, idTarea) });
    queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(idProyecto) });
  };

  const registrar = useMutation({
    mutationFn: (input: CreateTimeRecordInput) => registrarHorasTarea(idProyecto, idTarea, input),
    onSuccess: invalidateAll,
  });

  const editar = useMutation({
    mutationFn: ({ idRegistro, input }: { idRegistro: number; input: UpdateTimeRecordInput }) =>
      updateTimeRecord(idProyecto, idTarea, idRegistro, input),
    onSuccess: invalidateAll,
  });

  // 409 `REGISTRO_YA_REVOCADO` se trata como éxito idempotente: el estado
  // deseado (registro revocado) ya es el real; solo se refresca.
  const revocar = useMutation({
    mutationFn: async ({ idRegistro }: { idRegistro: number }) => {
      try {
        await revokeTimeRecord(idProyecto, idTarea, idRegistro);
      } catch (error) {
        if (isRegistroYaRevocado(error)) return;
        throw error;
      }
    },
    onSuccess: invalidateAll,
  });

  return {
    registros: recordsQuery.data ?? [],
    resumen: summaryQuery.data ?? null,
    isLoading: recordsQuery.isLoading || summaryQuery.isLoading,
    isError: recordsQuery.isError || summaryQuery.isError,
    error: recordsQuery.error ?? summaryQuery.error,
    refetch: () => {
      recordsQuery.refetch();
      summaryQuery.refetch();
    },
    registrar,
    editar,
    revocar,
  };
}
