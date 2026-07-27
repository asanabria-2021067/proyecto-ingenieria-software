'use client';

import { useQuery } from '@tanstack/react-query';
import { getProjectAvance } from '@/lib/services/projects';
import type { AvanceProyectoDTO } from '@/lib/dto/project.dto';

/**
 * Trae el % de avance del proyecto. El backend responde 403 si quien consulta
 * no es el líder ni un participante activo — en ese caso simplemente no hay
 * datos que mostrar (no es un error visible para el usuario).
 */
export function useProjectAvance(id: number) {
  return useQuery<AvanceProyectoDTO>({
    queryKey: ['project-avance', id],
    queryFn: () => getProjectAvance(id),
    enabled: !!id,
    retry: false,
  });
}
