'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  taskLinksQueryKey,
  taskEvidenceQueryKey,
  taskHistoryQueryKey,
  taskTemplatesQueryKey,
  projectTasksQueryKey,
} from '@/lib/query-keys/tasks';
import {
  addChecklistItem,
  addTaskEvidence,
  addTaskLink,
  createTaskTemplate,
  deleteTaskTemplate,
  getTaskEvidence,
  getTaskHistory,
  getTaskLinks,
  getTaskTemplates,
  removeChecklistItem,
  removeTaskEvidence,
  removeTaskLink,
  updateChecklistItem,
} from '@/lib/services/tasks';
import type {
  CreateEvidenciaInput,
  CreatePlantillaTareaInput,
  EnlaceTareaDTO,
  EvidenciaTareaDTO,
  HistorialTareaEntradaDTO,
  PlantillaTareaDTO,
} from '@/lib/types/tasks';

/**
 * MEJ-6: el checklist viaja dentro de la tarea (`TareaPublicaDTO.checklist`),
 * así que cada cambio solo invalida la lista de tareas del proyecto.
 */
export function useTaskChecklist(idProyecto: number, idTarea: number) {
  const queryClient = useQueryClient();
  const invalidar = () => queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });

  const agregar = useMutation({
    mutationFn: (texto: string) => addChecklistItem(idProyecto, idTarea, texto),
    onSuccess: invalidar,
  });
  const actualizar = useMutation({
    mutationFn: ({ idItem, ...input }: { idItem: number; texto?: string; completado?: boolean }) =>
      updateChecklistItem(idProyecto, idTarea, idItem, input),
    onSuccess: invalidar,
  });
  const quitar = useMutation({
    mutationFn: (idItem: number) => removeChecklistItem(idProyecto, idTarea, idItem),
    onSuccess: invalidar,
  });

  return { agregar, actualizar, quitar };
}

/**
 * MEJ-10. `marca` resume lo que la tarea muestra (estado, fecha, asignado): al
 * cambiar, la clave cambia y el historial se vuelve a pedir sin invalidar a mano.
 */
export function useTaskHistory(idProyecto: number, idTarea: number, marca = '') {
  const query = useQuery<HistorialTareaEntradaDTO[]>({
    queryKey: [...taskHistoryQueryKey(idProyecto, idTarea), marca],
    queryFn: () => getTaskHistory(idProyecto, idTarea),
    enabled: idProyecto > 0 && idTarea > 0,
  });
  return {
    entradas: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** MEJ-49 */
export function useTaskEvidence(idProyecto: number, idTarea: number) {
  const queryClient = useQueryClient();
  const query = useQuery<EvidenciaTareaDTO[]>({
    queryKey: taskEvidenceQueryKey(idProyecto, idTarea),
    queryFn: () => getTaskEvidence(idProyecto, idTarea),
    enabled: idProyecto > 0 && idTarea > 0,
  });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: taskEvidenceQueryKey(idProyecto, idTarea) });

  const subir = useMutation({
    mutationFn: (input: CreateEvidenciaInput) => addTaskEvidence(idProyecto, idTarea, input),
    onSuccess: invalidar,
  });
  const eliminar = useMutation({
    mutationFn: (idEvidencia: number) => removeTaskEvidence(idProyecto, idTarea, idEvidencia),
    onSuccess: invalidar,
  });

  return {
    evidencias: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    subir,
    eliminar,
  };
}

/** MEJ-107: enlaces de la tarea; `cantidadEnlaces` viaja en la tarea, así que también se invalida el tablero. */
export function useTaskLinks(idProyecto: number, idTarea: number) {
  const queryClient = useQueryClient();
  const query = useQuery<EnlaceTareaDTO[]>({
    queryKey: taskLinksQueryKey(idProyecto, idTarea),
    queryFn: () => getTaskLinks(idProyecto, idTarea),
    enabled: idProyecto > 0 && idTarea > 0,
  });
  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: taskLinksQueryKey(idProyecto, idTarea) });
    queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });
  };

  const agregar = useMutation({
    mutationFn: (url: string) => addTaskLink(idProyecto, idTarea, url),
    onSuccess: invalidar,
  });
  const quitar = useMutation({
    mutationFn: (idEnlace: number) => removeTaskLink(idProyecto, idTarea, idEnlace),
    onSuccess: invalidar,
  });

  return {
    enlaces: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    agregar,
    quitar,
  };
}

/** MEJ-52 */
export function useTaskTemplates(idProyecto: number, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery<PlantillaTareaDTO[]>({
    queryKey: taskTemplatesQueryKey(idProyecto),
    queryFn: () => getTaskTemplates(idProyecto),
    enabled: enabled && idProyecto > 0,
  });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: taskTemplatesQueryKey(idProyecto) });

  const crear = useMutation({
    mutationFn: (input: CreatePlantillaTareaInput) => createTaskTemplate(idProyecto, input),
    onSuccess: invalidar,
  });
  const eliminar = useMutation({
    mutationFn: (idPlantilla: number) => deleteTaskTemplate(idProyecto, idPlantilla),
    onSuccess: invalidar,
  });

  return {
    plantillas: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    crear,
    eliminar,
  };
}
