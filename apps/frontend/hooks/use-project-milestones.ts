'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createHito } from '@/lib/services/projects';
import type { CreateHitoPayload } from '@/lib/dto/project.dto';

/**
 * Los hitos del proyecto viven embebidos en `useProjectDetail` (query key
 * `['project', idProyecto]`, ver kanban-workspace-client.tsx), no en una
 * query propia: crear un hito solo necesita invalidar esa misma key para
 * que HitosSection reciba la lista actualizada.
 */
export function useProjectMilestones(idProyecto: number) {
  const queryClient = useQueryClient();

  const crearHito = useMutation({
    mutationFn: (input: CreateHitoPayload) => createHito(idProyecto, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
    },
  });

  return { crearHito };
}
