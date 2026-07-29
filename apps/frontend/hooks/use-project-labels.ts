'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectTasksQueryKey } from '@/lib/query-keys/tasks';
import {
  createLabel,
  deleteLabel,
  getProjectLabels,
  updateLabel,
  type CreateLabelInput,
  type LabelDTO,
  type UpdateLabelInput,
} from '@/lib/services/labels';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * `apps/frontend/lib/query-keys/` está protegido en esta tarea (Tarea 38,
 * sección 47) y no define todavía una factoría de etiquetas: se declara y
 * exporta aquí, junto a su único dueño real, en vez de tocar ese
 * directorio. Forma exacta: `['project-labels', idProyecto]`.
 */
export const projectLabelsQueryKey = (idProyecto: number) => ['project-labels', idProyecto] as const;

/**
 * Capa de datos canónica de etiquetas de un proyecto — mismo patrón que
 * `useProjectTasks` (Tarea 35): `labels` es `query.data ?? []`, nunca se
 * copia a `useState`; las invalidaciones ocurren únicamente en `onSuccess`,
 * sin optimismo.
 */
export function useProjectLabels(idProyecto: number) {
  const queryClient = useQueryClient();
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<LabelDTO[]>({
    queryKey: projectLabelsQueryKey(idProyecto),
    queryFn: () => getProjectLabels(idProyecto),
    enabled,
  });

  const invalidateLabels = () =>
    queryClient.invalidateQueries({ queryKey: projectLabelsQueryKey(idProyecto) });

  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });

  const crearEtiqueta = useMutation({
    mutationFn: (input: CreateLabelInput) => createLabel(idProyecto, input),
    onSuccess: invalidateLabels,
  });

  const editarEtiqueta = useMutation({
    mutationFn: ({ labelId, input }: { labelId: number; input: UpdateLabelInput }) =>
      updateLabel(idProyecto, labelId, input),
    onSuccess: () => {
      invalidateLabels();
      // nombre/color de la etiqueta aparecen en TaskCard vía TaskLabelChip.
      invalidateTasks();
    },
  });

  const eliminarEtiqueta = useMutation({
    mutationFn: ({ labelId }: { labelId: number }) => deleteLabel(idProyecto, labelId),
    onSuccess: () => {
      invalidateLabels();
      // el backend retira las asociaciones TareaEtiqueta al eliminar.
      invalidateTasks();
    },
  });

  return {
    labels: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createLabel: crearEtiqueta,
    updateLabel: editarEtiqueta,
    deleteLabel: eliminarEtiqueta,
  };
}
