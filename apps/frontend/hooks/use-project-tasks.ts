'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAvanceQueryKey, projectTasksQueryKey } from '@/lib/query-keys/tasks';
import {
  assignTask,
  closeAssignment,
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
  CloseAssignmentInput,
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
 * únicamente en `onSuccess`, salvo `cambiarEstadoTarea` (tarea 39: ver
 * comentario junto a esa mutation).
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

  // Única mutation de cambio de estado, compartida por el Select de
  // TaskCard y por el drag-and-drop (Tarea 39): ambos disparadores llaman a
  // este mismo `.mutate`, así que nunca compiten con dos mutations
  // distintas sobre la misma tarea. El optimismo vive aquí (no en un hook
  // separado ni en TaskBoard) precisamente porque es el único punto que ya
  // conocen ambos consumidores, evitando duplicar el endpoint o divergir en
  // el snapshot/rollback.
  const cambiarEstadoTarea = useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: UpdateTaskStateInput }) =>
      updateTaskEstado(idProyecto, taskId, input),
    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({ queryKey: projectTasksQueryKey(idProyecto) });
      const previousTasks = queryClient.getQueryData<TareaPublicaDTO[]>(
        projectTasksQueryKey(idProyecto),
      );
      queryClient.setQueryData<TareaPublicaDTO[]>(projectTasksQueryKey(idProyecto), (tareas) =>
        tareas?.map((tarea) =>
          tarea.idTarea === taskId ? { ...tarea, estadoTarea: input.estadoTarea } : tarea,
        ),
      );
      return { previousTasks };
    },
    onError: (_error, _variables, context) => {
      // Sin snapshot (caché vacía en el momento del onMutate): no se
      // inventa una tarea, se invalida para recuperar el estado real.
      if (context?.previousTasks !== undefined) {
        queryClient.setQueryData(projectTasksQueryKey(idProyecto), context.previousTasks);
      } else {
        invalidateTasks();
      }
    },
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

  /**
   * B2 (F10) — cierra la `AsignacionTarea` activa del actor en una única
   * transacción atómica del backend (horas reales + registro de avance +
   * `desasignadaEn` + `HECHO` opcional): el frontend nunca la divide en
   * varios requests. Invalida `project-tasks` (la tarea deja de tener
   * `asignacionActiva` y puede cambiar `estadoTarea`) y `project-avance`
   * (mismo criterio que `crearTarea`/`editarTarea`/`eliminarTarea`, porque
   * un cierre con `marcarComoHecha` mueve el conteo HECHO). No conoce el
   * dominio `exit-requests`: el wiring cross-domain con
   * `exit-preparation-summary` vive en el componente consumidor (F9), vía
   * `onSuccess`, para no acoplar este hook de tareas a otro dominio.
   */
  const cerrarAsignacion = useMutation({
    mutationFn: ({
      taskId,
      assignmentId,
      input,
    }: {
      taskId: number;
      assignmentId: number;
      input: CloseAssignmentInput;
    }) => closeAssignment(idProyecto, taskId, assignmentId, input),
    onSuccess: () => {
      invalidateTasks();
      invalidateAvance();
    },
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
    cerrarAsignacion,
    eliminarTarea,
    asociarEtiqueta,
    retirarEtiqueta,
  };
}
