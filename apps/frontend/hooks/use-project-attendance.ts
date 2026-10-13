'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectActivitiesQueryKey, projectActivityDetailQueryKey } from '@/lib/query-keys/attendance';
import { createActivity, getProjectActivities, getProjectActivity, markAttendance } from '@/lib/services/attendance';
import type {
  ActividadDetalle,
  ActividadResumen,
  CreateActividadInput,
  MarkAttendanceInput,
} from '@/lib/types/attendance';

function isValidId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

/** T-295 (HU-177): lista de actividades del proyecto — líder e integrante activo. */
export function useProjectActivities(idProyecto: number, habilitado = true) {
  const enabled = isValidId(idProyecto) && habilitado;

  const query = useQuery<ActividadResumen[]>({
    queryKey: projectActivitiesQueryKey(idProyecto),
    queryFn: () => getProjectActivities(idProyecto),
    enabled,
  });

  return {
    actividades: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** T-296 (HU-177): detalle de una actividad, con la asistencia de cada integrante. */
export function useProjectActivity(idProyecto: number, idActividad: number | null) {
  const enabled = isValidId(idProyecto) && idActividad !== null && isValidId(idActividad);

  const query = useQuery<ActividadDetalle>({
    queryKey: projectActivityDetailQueryKey(idProyecto, idActividad ?? 0),
    queryFn: () => getProjectActivity(idProyecto, idActividad as number),
    enabled,
  });

  return {
    actividad: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Mutaciones de actividades/asistencia, exclusivas del líder en backend.
 * `marcarAsistencia` actualiza de forma optimista la fila del integrante en
 * la caché de detalle (mismo patrón que `cambiarEstadoTarea` en
 * use-project-tasks.ts): el switch responde al instante y, si el PATCH
 * falla, se revierte al snapshot previo y se avisa con un toast.
 */
export function useProjectAttendanceMutations(idProyecto: number) {
  const queryClient = useQueryClient();

  const invalidateActivities = () =>
    queryClient.invalidateQueries({ queryKey: projectActivitiesQueryKey(idProyecto) });

  const crearActividad = useMutation({
    mutationFn: (input: CreateActividadInput) => createActivity(idProyecto, input),
    onSuccess: invalidateActivities,
  });

  const marcarAsistencia = useMutation({
    mutationFn: ({
      idActividad,
      idUsuario,
      input,
    }: {
      idActividad: number;
      idUsuario: number;
      input: MarkAttendanceInput;
    }) => markAttendance(idProyecto, idActividad, idUsuario, input),
    onMutate: async ({ idActividad, idUsuario, input }) => {
      const detailKey = projectActivityDetailQueryKey(idProyecto, idActividad);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previousDetail = queryClient.getQueryData<ActividadDetalle>(detailKey);
      queryClient.setQueryData<ActividadDetalle>(detailKey, (actividad) =>
        actividad
          ? {
              ...actividad,
              integrantes: actividad.integrantes.map((integrante) =>
                integrante.idUsuario === idUsuario ? { ...integrante, asistio: input.asistio } : integrante,
              ),
            }
          : actividad,
      );
      return { previousDetail, detailKey };
    },
    onError: (_error, { idActividad }, context) => {
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      } else {
        queryClient.invalidateQueries({ queryKey: projectActivityDetailQueryKey(idProyecto, idActividad) });
      }
    },
    onSuccess: (_result, { idActividad }) => {
      invalidateActivities();
      queryClient.invalidateQueries({ queryKey: projectActivityDetailQueryKey(idProyecto, idActividad) });
    },
  });

  return { crearActividad, marcarAsistencia };
}
