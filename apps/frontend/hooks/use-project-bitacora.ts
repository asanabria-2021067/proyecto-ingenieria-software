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
 * exclusivo del líder en backend (`BitacoraContextService.assertProjectLeader`,
 * 403 para cualquier otro usuario). Read-only: no expone ninguna
 * invalidación propia porque no muta nada — mismo patrón que useSprintDetail.
 *
 * `habilitado` (default `true`): permite al caller evitar disparar la
 * petición cuando ya sabe, por el usuario identificado vía la cookie JWT
 * (`useIsProjectLeader`), que no es líder — así no se le pega
 * innecesariamente al backend para recibir un 403 ya previsible. El backend
 * sigue siendo quien realmente autoriza; esto es solo una optimización de
 * red, nunca la capa de seguridad.
 */
export function useProjectBitacora(idProyecto: number, filtros: FiltrosBitacora, habilitado = true) {
  const enabled = isValidProjectId(idProyecto) && habilitado;

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
