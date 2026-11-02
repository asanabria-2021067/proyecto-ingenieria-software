'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadBlob } from '@/lib/download-file';
import {
  createReconocimiento,
  fetchSprintReportCsv,
  fetchSprintReportPdf,
  getPortafolioAsociacion,
  getPortafolioOrganizacion,
  getReconocimientosSprint,
  getResultadosProyecto,
  getRetrospectivaSprint,
  getSeguimientoProyecto,
  saveRetrospectivaSprint,
  type ProyectoCerradoResumenDTO,
  type ReconocimientosSprintDTO,
  type ResultadosProyectoDTO,
  type RetrospectivaDTO,
  type RetrospectivaInput,
  type SeguimientoProyectoDTO,
} from '@/lib/services/seguimiento';

const esId = (id: number) => Number.isInteger(id) && id > 0;

/** MEJ-54/55: hitos atrasados y semáforo. El 403 (quien no es del equipo) no se reintenta. */
export function useSeguimientoProyecto(idProyecto: number, enabled = true) {
  return useQuery<SeguimientoProyectoDTO>({
    queryKey: ['seguimiento-proyecto', idProyecto],
    queryFn: () => getSeguimientoProyecto(idProyecto),
    enabled: enabled && esId(idProyecto),
    retry: false,
    staleTime: 60_000,
  });
}

/** MEJ-56: resultados de un proyecto cerrado. */
export function useResultadosProyecto(idProyecto: number) {
  return useQuery<ResultadosProyectoDTO>({
    queryKey: ['resultados-proyecto', idProyecto],
    queryFn: () => getResultadosProyecto(idProyecto),
    enabled: esId(idProyecto),
    retry: false,
  });
}

/** MEJ-56: portafolio de proyectos cerrados de una organización o una asociación. */
export function usePortafolio(tipo: 'organizacion' | 'asociacion', id: number, enabled = true) {
  return useQuery<ProyectoCerradoResumenDTO[]>({
    queryKey: ['portafolio', tipo, id],
    queryFn: () => (tipo === 'organizacion' ? getPortafolioOrganizacion(id) : getPortafolioAsociacion(id)),
    enabled: enabled && esId(id),
    retry: false,
  });
}

/** MEJ-57: reconocimientos del sprint y alta de uno nuevo. */
export function useReconocimientosSprint(idProyecto: number, idSprint: number) {
  const queryClient = useQueryClient();
  const queryKey = ['reconocimientos-sprint', idProyecto, idSprint] as const;
  const query = useQuery<ReconocimientosSprintDTO>({
    queryKey,
    queryFn: () => getReconocimientosSprint(idProyecto, idSprint),
    enabled: esId(idProyecto) && esId(idSprint),
    retry: false,
  });
  const reconocer = useMutation({
    mutationFn: (input: { idReceptor: number; mensaje: string }) => createReconocimiento(idProyecto, idSprint, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { ...query, reconocer };
}

/** MEJ-24: retrospectiva opcional del sprint. */
export function useRetrospectivaSprint(idProyecto: number, idSprint: number) {
  const queryClient = useQueryClient();
  const queryKey = ['retrospectiva-sprint', idProyecto, idSprint] as const;
  const query = useQuery<RetrospectivaDTO | null>({
    queryKey,
    queryFn: () => getRetrospectivaSprint(idProyecto, idSprint),
    enabled: esId(idProyecto) && esId(idSprint),
    retry: false,
  });
  const guardar = useMutation({
    mutationFn: (input: RetrospectivaInput) => saveRetrospectivaSprint(idProyecto, idSprint, input),
    onSuccess: (guardada) => {
      queryClient.setQueryData(queryKey, guardada);
      queryClient.invalidateQueries({ queryKey: ['project-bitacora', idProyecto] });
    },
  });
  return { ...query, guardar };
}

/** MEJ-23: descarga del reporte del sprint; un `isPending` y un error por formato. */
export function useSprintReport(idProyecto: number, idSprint: number) {
  const csv = useMutation({
    mutationFn: async () => downloadBlob(await fetchSprintReportCsv(idProyecto, idSprint), `reporte-sprint-${idSprint}.csv`),
  });
  const pdf = useMutation({
    mutationFn: async () => downloadBlob(await fetchSprintReportPdf(idProyecto, idSprint), `reporte-sprint-${idSprint}.pdf`),
  });
  return { csv, pdf };
}
