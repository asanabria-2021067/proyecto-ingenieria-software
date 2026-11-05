'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminPendientesQueryKey } from '@/lib/query-keys/admin-accounts';
import {
  atenderReporteProblema,
  borrarEjemploProyecto,
  cerrarPrimerosPasos,
  crearEjemploProyecto,
  enviarReporteProblema,
  getEjemploProyecto,
  getPrimerosPasos,
  listarReportesProblema,
  type ReporteProblemaPayload,
  type EstadoReporte,
} from '@/lib/services/ayuda';

const primerosPasosKey = ['primeros-pasos'] as const;
const ejemploKey = (idProyecto: number) => ['ejemplo-proyecto', idProyecto] as const;

export const usePrimerosPasos = () => useQuery({ queryKey: primerosPasosKey, queryFn: getPrimerosPasos, staleTime: 0 });

export function useCerrarPrimerosPasos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cerrarPrimerosPasos,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: primerosPasosKey }),
  });
}

export const useEjemploProyecto = (idProyecto: number, enabled = true) =>
  useQuery({ queryKey: ejemploKey(idProyecto), queryFn: () => getEjemploProyecto(idProyecto), enabled, retry: false });

// Crear o borrar el ejemplo cambia sprints y tareas del proyecto: se refresca todo lo del proyecto.
function useCambioEjemplo(idProyecto: number, fn: (id: number) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fn(idProyecto),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const useCrearEjemplo = (idProyecto: number) => useCambioEjemplo(idProyecto, crearEjemploProyecto);
export const useBorrarEjemplo = (idProyecto: number) => useCambioEjemplo(idProyecto, borrarEjemploProyecto);

export const useEnviarReporte = () => useMutation({ mutationFn: (payload: ReporteProblemaPayload) => enviarReporteProblema(payload) });

export const useReportesProblema = (estado: EstadoReporte) =>
  useQuery({ queryKey: ['admin', 'reportes-problema', estado], queryFn: () => listarReportesProblema(estado) });

export function useAtenderReporte() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: atenderReporteProblema,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reportes-problema'] });
      void queryClient.invalidateQueries({ queryKey: adminPendientesQueryKey });
    },
  });
}
