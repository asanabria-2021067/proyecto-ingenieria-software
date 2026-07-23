'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAvanceQueryKey, projectTasksQueryKey } from '@/lib/query-keys/tasks';
import {
  assignTask,
  createTask,
  deleteTask,
  getProjectTasks,
  unassignTask,
  updateTask,
  updateTaskEstado,
} from '@/lib/services/tasks';
import { attachLabelToTask, detachLabelFromTask } from '@/lib/services/labels';
import type {
  AssignTaskInput,
  CreateTaskInput,
  TareaPublicaDTO,
  UpdateTaskInput,
  UpdateTaskStateInput,
} from '@/lib/types/tasks';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * Capa de datos canónica de tareas de un proyecto. No deriva columnas
 * Kanban ni copia la respuesta a useState: `tasks` es directamente
 * `query.data ?? []`. Las ocho mutations ya conocen `idProyecto`; sus
 * argumentos nunca reciben otro projectId. Las invalidaciones ocurren
 * únicamente en `onSuccess` — sin actualización optimista (tarea 39).
 */
export function useProjectTasks(idProyecto: number) {
  const queryClient = useQueryClient();
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<TareaPublicaDTO[]>({
    queryKey: projectTasksQueryKey(idProyecto),
    queryFn: () => getProjectTasks(idProyecto),
    enabled,
  });

  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });

  const invalidateAvance = () =>
    queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(idProyecto) });

  const crearTarea = useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(idProyecto, input),
    onSuccess: () => {
      invalidateTasks();
      invalidateAvance();
    },
  });

  const editarTarea = useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: UpdateTaskInput }) =>
      updateTask(idProyecto, taskId, input),
    onSuccess: () => {
      invalidateTasks();
      invalidateAvance();
    },
  });

  const cambiarEstadoTarea = useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: UpdateTaskStateInput }) =>
      updateTaskEstado(idProyecto, taskId, input),
    onSuccess: () => {
      invalidateTasks();
      invalidateAvance();
    },
  });

  const asignarTarea = useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: AssignTaskInput }) =>
      assignTask(idProyecto, taskId, input),
    onSuccess: invalidateTasks,
  });

  const desasignarTarea = useMutation({
    mutationFn: ({ taskId }: { taskId: number }) => unassignTask(idProyecto, taskId),
    onSuccess: invalidateTasks,
  });

  const eliminarTarea = useMutation({
    mutationFn: ({ taskId }: { taskId: number }) => deleteTask(idProyecto, taskId),
    onSuccess: () => {
      invalidateTasks();
      invalidateAvance();
    },
  });

  const asociarEtiqueta = useMutation({
    mutationFn: ({ taskId, labelId }: { taskId: number; labelId: number }) =>
      attachLabelToTask(idProyecto, taskId, labelId),
    onSuccess: invalidateTasks,
  });

  const retirarEtiqueta = useMutation({
    mutationFn: ({ taskId, labelId }: { taskId: number; labelId: number }) =>
      detachLabelFromTask(idProyecto, taskId, labelId),
    onSuccess: invalidateTasks,
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    crearTarea,
    editarTarea,
    cambiarEstadoTarea,
    asignarTarea,
    desasignarTarea,
    eliminarTarea,
    asociarEtiqueta,
    retirarEtiqueta,
  };
}
