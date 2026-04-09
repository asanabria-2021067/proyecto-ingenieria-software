'use client';

import { useQuery } from '@tanstack/react-query';
import { getProjectById } from '@/lib/services/projects';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

export function useProjectDetail(id: number) {
  return useQuery<ProyectoDetalleDTO>({
    queryKey: ['project', id],
    queryFn: () => getProjectById(id),
    enabled: !!id,
  });
}
