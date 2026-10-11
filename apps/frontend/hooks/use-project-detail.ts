'use client';

import { useQuery } from '@tanstack/react-query';
import { getAccessibleProjectById } from '@/lib/services/projects';
import { projectDetailQueryKey } from '@/lib/query-keys/project';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

/** Respuestas que no cambian por repetir la petición. */
const ESTADOS_TERMINALES = new Set([401, 403, 404]);

/**
 * GPI01-C04 (H-03): los errores terminales no se reintentan. Antes un proyecto
 * cerrado repetía el mismo 404 cuatro veces por cada componente que lo pedía.
 */
export function reintentarLecturaDeProyecto(failureCount: number, error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return !(status !== undefined && ESTADOS_TERMINALES.has(status)) && failureCount < 3;
}

export function useProjectDetail(id: number) {
  return useQuery<ProyectoDetalleDTO>({
    queryKey: projectDetailQueryKey(id),
    queryFn: () => getAccessibleProjectById(id),
    enabled: !!id,
    retry: reintentarLecturaDeProyecto,
  });
}
