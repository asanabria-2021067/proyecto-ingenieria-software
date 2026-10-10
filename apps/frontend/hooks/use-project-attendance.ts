'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { actividadDetalleQueryKey, projectActividadesQueryKey } from '@/lib/query-keys/attendance';
import { getActividadDetalle, getProjectActividades, marcarAsistencia } from '@/lib/services/attendance';
import type { ActividadDetalle, ActividadResumen } from '@/lib/types/attendance';

function isValidId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/**
 * HU-177 (T-298) — actividades del proyecto. Las lee el líder, el admin y el
 * participante activo; quién puede lo decide `ProjectReadPolicyService`
 * (scope `asistencia`). `habilitado` solo evita pedir lo que ya se sabe que
 * el backend rechazará, igual que en useProjectBitacora.
 */
export function useProjectActividades(idProyecto: number, habilitado = true) {
  const query = useQuery<ActividadResumen[]>({
    queryKey: projectActividadesQueryKey(idProyecto),
    queryFn: () => getProjectActividades(idProyecto),
    enabled: isValidId(idProyecto) && habilitado,
  });

  return {
    actividades: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** HU-177 (T-298) — detalle de una actividad con la asistencia de cada integrante activo. */
export function useActividadDetalle(idProyecto: number, idActividad: number | null) {
  const query = useQuery<ActividadDetalle>({
    queryKey: actividadDetalleQueryKey(idProyecto, idActividad ?? 0),
    queryFn: () => getActividadDetalle(idProyecto, idActividad as number),
    enabled: isValidId(idProyecto) && isValidId(idActividad),
  });

  return {
    actividad: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface MarcarAsistenciaInput {
  idActividad: number;
  idUsuario: number;
  asistio: boolean;
}

/**
 * HU-177 (T-298) — marca o quita la asistencia de un integrante. Sin
 * actualización optimista: el detalle solo cambia con la respuesta real del
 * PATCH, y luego se invalidan detalle y lista (el resumen cuenta asistentes).
 */
export function useMarcarAsistencia(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ idActividad, idUsuario, asistio }: MarcarAsistenciaInput) =>
      marcarAsistencia(idProyecto, idActividad, idUsuario, asistio),
    onSuccess: (asistencia) => {
      const detalleKey = actividadDetalleQueryKey(idProyecto, asistencia.idActividad);
      queryClient.setQueryData<ActividadDetalle>(detalleKey, (actual) =>
        actual
          ? {
              ...actual,
              integrantes: actual.integrantes.map((integrante) =>
                integrante.idUsuario === asistencia.idUsuario
                  ? { ...integrante, asistio: asistencia.asistio, confirmadoEn: asistencia.confirmadoEn }
                  : integrante,
              ),
            }
          : actual,
      );
      queryClient.invalidateQueries({ queryKey: detalleKey });
      queryClient.invalidateQueries({ queryKey: projectActividadesQueryKey(idProyecto) });
    },
  });
}
