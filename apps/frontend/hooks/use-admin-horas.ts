'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { horasSemestreKeys } from '@/lib/query-keys/horas-semestre';
import {
  getAsociacionesAdmin,
  getHorasCentral,
  getHorasComparativo,
  getResumenAsociaciones,
  getHorasTotales,
  type HorasCentralFiltros,
} from '@/lib/services/horas-semestre';

export const useAdminHorasCentral = (filtros: HorasCentralFiltros) =>
  useInfiniteQuery({
    queryKey: horasSemestreKeys.central(filtros),
    queryFn: ({ pageParam }) => getHorasCentral(filtros, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (ultima) => ultima.siguienteCursor ?? undefined,
  });

export const useAdminHorasTotales = (filtros: HorasCentralFiltros) =>
  useQuery({ queryKey: horasSemestreKeys.totales(filtros), queryFn: () => getHorasTotales(filtros) });

export const useHorasComparativo = () =>
  useQuery({ queryKey: horasSemestreKeys.comparativo, queryFn: getHorasComparativo });

export const useResumenAsociaciones = () =>
  useQuery({ queryKey: horasSemestreKeys.resumenAsociaciones, queryFn: getResumenAsociaciones });

export const useAdminAsociaciones = (enabled = true) =>
  useQuery({ queryKey: horasSemestreKeys.asociaciones, queryFn: getAsociacionesAdmin, staleTime: 5 * 60_000, enabled });
