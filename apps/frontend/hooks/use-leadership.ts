'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeReadinessPrefix } from '@/lib/query-keys/closure';
import {
  leadershipAppealsPrefix,
  leadershipAppealsQueryKey,
  leadershipCandidatesQueryKey,
  leadershipContextQueryKey,
  leadershipHistoryQueryKey,
} from '@/lib/query-keys/leadership';
import {
  cancelLeadershipAppeal,
  createLeadershipAppeal,
  getLeadershipAppeals,
  getLeadershipCandidates,
  getLeadershipContext,
  getLeadershipHistory,
} from '@/lib/services/leadership';
import type {
  ApelacionItemDto,
  CreateLeadershipAppealInput,
  LeadershipCandidatesDto,
  LeadershipContextDto,
  LeadershipHistoryItemDto,
  PaginaLiderazgo,
} from '@/lib/types/leadership';

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * VIEW-06 (F008) — lecturas de liderazgo. Ninguna deriva permisos: los
 * flags y advertencias vienen del servidor y `LEADERSHIP_CHANGED` solo
 * invalida para que el servidor vuelva a decidir.
 */
export function useLeadershipContext(idProyecto: number, enabled = true) {
  return useQuery<LeadershipContextDto>({
    queryKey: leadershipContextQueryKey(idProyecto),
    queryFn: () => getLeadershipContext(idProyecto),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

export function useLeadershipCandidates(idProyecto: number, enabled = true) {
  return useQuery<LeadershipCandidatesDto>({
    queryKey: leadershipCandidatesQueryKey(idProyecto),
    queryFn: () => getLeadershipCandidates(idProyecto),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

export function useLeadershipHistory(idProyecto: number, page = 1, enabled = true) {
  return useQuery<PaginaLiderazgo<LeadershipHistoryItemDto>>({
    queryKey: leadershipHistoryQueryKey(idProyecto, page),
    queryFn: () => getLeadershipHistory(idProyecto, page),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

/** `estado` opcional (`'PENDIENTE'`…); sin él, todas las apelaciones visibles para el lector. */
export function useLeadershipAppeals(idProyecto: number, estado?: string, page = 1, enabled = true) {
  return useQuery<PaginaLiderazgo<ApelacionItemDto>>({
    queryKey: leadershipAppealsQueryKey(idProyecto, estado ?? 'TODAS', page),
    queryFn: () => getLeadershipAppeals(idProyecto, { estado, page }),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

/**
 * VIEW-17 (F009) — crear / cancelar la apelación del líder. Tras cualquiera
 * de las dos se invalidan las apelaciones (prefijo), el contexto, los
 * candidatos y el readiness del cierre (una apelación pendiente es el
 * blocker `APELACION_PENDIENTE`).
 */
export function useLeadershipAppealMutations(idProyecto: number) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: leadershipAppealsPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: leadershipContextQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: leadershipCandidatesQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(idProyecto) });
  };

  const create = useMutation({
    mutationFn: (input: CreateLeadershipAppealInput) => createLeadershipAppeal(idProyecto, input),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: ({ idApelacion }: { idApelacion: number }) => cancelLeadershipAppeal(idProyecto, idApelacion),
    onSuccess: invalidate,
  });

  return { create, cancel, invalidate };
}
