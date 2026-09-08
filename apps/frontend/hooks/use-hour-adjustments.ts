'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintClosingSummaryQueryKey } from '@/lib/query-keys/sprints';
import {
  deleteHourAdjustment,
  getHourAdjustment,
  upsertHourAdjustment,
} from '@/lib/services/hour-adjustments';
import type { UpsertHourAdjustmentInput } from '@/lib/types/sprints';

/**
 * Convierte el valor ABSOLUTO que escribe el líder («Horas propuestas») en
 * el `deltaHoras` con signo y dos decimales que exige el DTO
 * (`propuestas − reportadas`). Se opera en centésimas enteras para que
 * `0.1 + 0.2` no produzca un delta con cola binaria.
 */
export function toDeltaHoras(propuestas: number, reportadas: string): string {
  const propuestasC = Math.round(propuestas * 100);
  const reportadasC = Math.round(Number(reportadas) * 100);
  const deltaC = propuestasC - reportadasC;
  const signo = deltaC < 0 ? '-' : '';
  const abs = Math.abs(deltaC);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function isDeltaCero(deltaHoras: string): boolean {
  return Number(deltaHoras) === 0;
}

/**
 * VIEW-03 (F002) — ajuste de horas por ASIGNACIÓN (E070/E071/E072). El ajuste
 * vive dentro del resumen de cierre: tras cada mutación se invalida
 * `sprintClosingSummaryQueryKey(pid, sid)` y no existe una key por tramo.
 */
export function useHourAdjustments(idProyecto: number, idSprint: number) {
  const queryClient = useQueryClient();

  const invalidateSummary = () =>
    queryClient.invalidateQueries({ queryKey: sprintClosingSummaryQueryKey(idProyecto, idSprint) });

  const upsert = useMutation({
    mutationFn: ({ idAsignacion, input }: { idAsignacion: number; input: UpsertHourAdjustmentInput }) =>
      upsertHourAdjustment(idProyecto, idSprint, idAsignacion, input),
    onSuccess: invalidateSummary,
  });

  const revert = useMutation({
    mutationFn: ({ idAsignacion }: { idAsignacion: number }) =>
      deleteHourAdjustment(idProyecto, idSprint, idAsignacion),
    onSuccess: invalidateSummary,
  });

  // Historial bajo demanda («Ver historial»): se lee al pulsar y no se
  // cachea como query propia — el estado vigente ya viene en el resumen.
  const history = useMutation({
    mutationFn: ({ idAsignacion }: { idAsignacion: number }) =>
      getHourAdjustment(idProyecto, idSprint, idAsignacion),
  });

  return { upsert, revert, history };
}
