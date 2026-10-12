'use client';

import { useQuery } from '@tanstack/react-query';
import { getAccessibleProjectById } from '@/lib/services/projects';
import { projectDetailQueryKey } from '@/lib/query-keys/project';
import { reintentarSiNoEsTerminal } from '@/lib/api/query-retry';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

export function useProjectDetail(id: number) {
  return useQuery<ProyectoDetalleDTO>({
    queryKey: projectDetailQueryKey(id),
    queryFn: () => getAccessibleProjectById(id),
    enabled: !!id,
    // GPI01-C04 (H-03): antes un proyecto cerrado repetía el mismo 404 cuatro
    // veces por cada componente que lo pedía.
    retry: reintentarSiNoEsTerminal,
  });
}
