'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminProjectDetailQueryKey, adminProjectsPrefix } from '@/lib/query-keys/admin-projects';
import { closeReadinessPrefix, closureRevisionPrefix, closureRevisionsPrefix } from '@/lib/query-keys/closure';
import { projectDetailQueryKey } from '@/lib/query-keys/project';
import {
  approveClosure,
  requestCorrection,
  returnToExecution,
  type ApproveClosureInput,
  type CorrectionInput,
  type ReturnExecutionInput,
} from '@/lib/services/closure-review';
import type { ClosureRevision } from '@/lib/types/closure';

/**
 * La entrega revisable es la revisión `ENVIADA` (única por proyecto). Si hay
 * más de una por datos inconsistentes, se toma la de mayor número.
 */
export function findRevisionEnviada(items: ClosureRevision[] | undefined): ClosureRevision | null {
  if (!items || items.length === 0) return null;
  return items.filter((r) => r.estadoRevision === 'ENVIADA').sort((a, b) => b.numeroRevision - a.numeroRevision)[0] ?? null;
}

/**
 * VIEW-14 (F016) — los tres veredictos. Tras CUALQUIERA se invalidan
 * readiness, revisiones (lista y detalle), el detalle administrativo y el
 * prefijo `['admin','proyectos']` para que el proyecto cambie de grupo en la
 * bandeja. Ningún veredicto reintenta solo: 409 y 503 los resuelve la UI.
 */
export function useClosureReview(idProyecto: number) {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closureRevisionsPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closureRevisionPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: adminProjectDetailQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: adminProjectsPrefix });
    queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(idProyecto) });
  };

  const devolver = useMutation({
    mutationFn: (input: ReturnExecutionInput) => returnToExecution(idProyecto, input),
    onSuccess: invalidateAll,
  });

  const corregir = useMutation({
    mutationFn: (input: CorrectionInput) => requestCorrection(idProyecto, input),
    onSuccess: invalidateAll,
  });

  const aprobar = useMutation({
    mutationFn: (input: ApproveClosureInput) => approveClosure(idProyecto, input),
    onSuccess: invalidateAll,
  });

  return { devolver, corregir, aprobar, invalidateAll };
}
