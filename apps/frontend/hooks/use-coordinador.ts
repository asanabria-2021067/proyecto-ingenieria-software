'use client';

import { useQuery } from '@tanstack/react-query';
import { getMiAlcance, getPendientesCoordinador } from '@/lib/services/coordinador';

export const coordinadorKeys = {
  miAlcance: ['coordinador', 'mi-alcance'] as const,
  pendientes: ['coordinador', 'pendientes'] as const,
  alcanceDe: (idUsuario: number) => ['coordinador', 'alcance', idUsuario] as const,
};

export const useMiAlcance = () => useQuery({ queryKey: coordinadorKeys.miAlcance, queryFn: getMiAlcance });

export const useCoordinadorPendientes = () =>
  useQuery({ queryKey: coordinadorKeys.pendientes, queryFn: getPendientesCoordinador, refetchInterval: 30 * 1000 });
