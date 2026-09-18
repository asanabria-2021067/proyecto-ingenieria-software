'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createHito } from '@/lib/services/projects';
import { projectAvanceQueryKey, projectTasksQueryKey } from '@/lib/query-keys/tasks';
import type { CreateHitoPayload } from '@/lib/dto/project.dto';

/**
 * Los hitos del proyecto viven embebidos en `useProjectDetail` (query key
 * `['project', idProyecto]`, ver kanban-workspace-client.tsx), no en una
 * query propia: crear un hito solo necesita invalidar esa misma key para
 * que HitosSection reciba la lista actualizada.
 *
 * T-186 (HU-147): cuando el payload incluye `idsTareas`, la creación
 * también reasigna `idHito` de esas tareas en el backend — pero las tareas
 * viven en una query key separada (`project-tasks`, ver
 * hooks/use-project-tasks.ts), así que hay que invalidarla también (y
 * `project-avance`, porque el progreso por hito cambia). Sin `idsTareas`
 * (crear un hito suelto) el comportamiento es idéntico al de antes.
 */
export function useProjectMilestones(idProyecto: number) {
  const queryClient = useQueryClient();

  const crearHito = useMutation({
    mutationFn: (input: CreateHitoPayload) => createHito(idProyecto, input),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
      if (variables.idsTareas && variables.idsTareas.length > 0) {
        queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });
        queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(idProyecto) });
      }
    },
  });

  return { crearHito };
}
