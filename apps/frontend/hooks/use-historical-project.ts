'use client';

import { useQuery } from '@tanstack/react-query';
import { deletedContributionsQueryKey, historicalProjectQueryKey } from '@/lib/query-keys/historical';
import {
  getDeletedContributions,
  getHistoricalProject,
  type DeletedContribution,
  type HistoricalProjectView,
} from '@/lib/services/historical';

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * VIEW-02 (F007) — histórico de un proyecto `CERRADO`. Solo se monta cuando
 * el proyecto está cerrado (o cuando el GET público lo rechaza y hay que
 * comprobar si existe como histórico): un proyecto abierto nunca lo consulta.
 * Sin mutations: la superficie es de solo lectura por contrato.
 */
export function useHistoricalProject(idProyecto: number, enabled: boolean) {
  return useQuery<HistoricalProjectView>({
    queryKey: historicalProjectQueryKey(idProyecto),
    queryFn: () => getHistoricalProject(idProyecto),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

export function useDeletedContributions(idProyecto: number, idSprint: number, enabled: boolean) {
  return useQuery<DeletedContribution[]>({
    queryKey: deletedContributionsQueryKey(idProyecto, idSprint),
    queryFn: () => getDeletedContributions(idProyecto, idSprint),
    enabled: enabled && isValidId(idProyecto) && isValidId(idSprint),
    retry: false,
  });
}
