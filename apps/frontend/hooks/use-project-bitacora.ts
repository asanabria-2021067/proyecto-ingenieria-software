'use client';

import { useQuery } from '@tanstack/react-query';
import { projectBitacoraQueryKey } from '@/lib/query-keys/bitacora';
import { getProjectBitacora } from '@/lib/services/bitacora';
import type { BitacoraPaginadaDto, FiltrosBitacora } from '@/lib/types/bitacora';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Bitácora semántica de Sprint (HU-140) — `GET /proyectos/:id/bitacora`,
 * exclusivo del líder en backend. Read-only: no expone ninguna invalidación
 * propia porque no muta nada — mismo patrón que useSprintDetail.
 */
export function useProjectBitacora(idProyecto: number, filtros: FiltrosBitacora) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<BitacoraPaginadaDto>({
    queryKey: projectBitacoraQueryKey(idProyecto, filtros),
    queryFn: () => getProjectBitacora(idProyecto, filtros),
    enabled,
    placeholderData: (previousData) => previousData,
  });

  return {
    eventos: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
