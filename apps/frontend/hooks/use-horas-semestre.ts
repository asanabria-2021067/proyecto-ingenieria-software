'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { horasSemestreKeys } from '@/lib/query-keys/horas-semestre';
import {
  getHorasActual,
  getHorasHistorial,
  getHorasProgreso,
  putHorasActual,
  type ActualizarRegistroHoras,
} from '@/lib/services/horas-semestre';

export const useHorasActual = () => useQuery({ queryKey: horasSemestreKeys.actual, queryFn: getHorasActual });

export const useHorasProgreso = () =>
  useQuery({ queryKey: horasSemestreKeys.progreso, queryFn: getHorasProgreso, staleTime: 0 });

export const useHorasHistorial = () => useQuery({ queryKey: horasSemestreKeys.historial, queryFn: getHorasHistorial });

export function useGuardarHorasActual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ActualizarRegistroHoras) => putHorasActual(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: horasSemestreKeys.all }),
  });
}
