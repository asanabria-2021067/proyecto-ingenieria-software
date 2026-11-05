import { apiFetch } from '@/lib/api/client';
import type {
  AssignTaskInput,
  BulkTaskActionInput,
  BulkTaskActionResultDTO,
  ChecklistItemDTO,
  CloseAssignmentInput,
  CreateEvidenciaInput,
  CreatePlantillaTareaInput,
  CreateTaskInput,
  EnlaceTareaDTO,
  EvidenciaTareaDTO,
  HistorialTareaEntradaDTO,
  PlantillaTareaDTO,
  TareaPublicaDTO,
  UpdateTaskInput,
  UpdateTaskStateInput,
} from '@/lib/types/tasks';

export function getProjectTasks(idProyecto: number): Promise<TareaPublicaDTO[]> {
  return apiFetch<TareaPublicaDTO[]>(`/proyectos/${idProyecto}/tareas`);
}

export function getProjectTask(idProyecto: number, idTarea: number): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}`);
}

export function createTask(idProyecto: number, input: CreateTaskInput): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTask(
  idProyecto: number,
  idTarea: number,
  input: UpdateTaskInput,
): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateTaskEstado(
  idProyecto: number,
  idTarea: number,
  input: UpdateTaskStateInput,
): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/estado`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function assignTask(
  idProyecto: number,
  idTarea: number,
  input: AssignTaskInput,
): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/asignar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unassignTask(idProyecto: number, idTarea: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/asignar`, {
    method: 'DELETE',
  });
}

/** HU-202 — `POST /proyectos/:id/tareas/acciones-masivas` (solo líder, todo o nada). */
export function bulkTaskAction(
  idProyecto: number,
  input: BulkTaskActionInput,
): Promise<BulkTaskActionResultDTO> {
  return apiFetch<BulkTaskActionResultDTO>(`/proyectos/${idProyecto}/tareas/acciones-masivas`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteTask(idProyecto: number, idTarea: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}`, {
    method: 'DELETE',
  });
}

/** B2 — `POST /proyectos/:id/tareas/:taskId/asignaciones/:assignmentId/cerrar`. */
export function closeAssignment(
  idProyecto: number,
  idTarea: number,
  idAsignacion: number,
  input: CloseAssignmentInput,
): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(
    `/proyectos/${idProyecto}/tareas/${idTarea}/asignaciones/${idAsignacion}/cerrar`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

/** MEJ-6 — checklist: cada operación devuelve la lista completa actualizada. */
export function addChecklistItem(idProyecto: number, idTarea: number, texto: string): Promise<ChecklistItemDTO[]> {
  return apiFetch<ChecklistItemDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/checklist`, {
    method: 'POST',
    body: JSON.stringify({ texto }),
  });
}

export function updateChecklistItem(
  idProyecto: number,
  idTarea: number,
  idItem: number,
  input: { texto?: string; completado?: boolean },
): Promise<ChecklistItemDTO[]> {
  return apiFetch<ChecklistItemDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/checklist/${idItem}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeChecklistItem(idProyecto: number, idTarea: number, idItem: number): Promise<ChecklistItemDTO[]> {
  return apiFetch<ChecklistItemDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/checklist/${idItem}`, {
    method: 'DELETE',
  });
}

/** MEJ-10 */
export function getTaskHistory(idProyecto: number, idTarea: number): Promise<HistorialTareaEntradaDTO[]> {
  return apiFetch<HistorialTareaEntradaDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/historial`);
}

/** MEJ-49 */
export function getTaskEvidence(idProyecto: number, idTarea: number): Promise<EvidenciaTareaDTO[]> {
  return apiFetch<EvidenciaTareaDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/evidencias`);
}

export function addTaskEvidence(
  idProyecto: number,
  idTarea: number,
  input: CreateEvidenciaInput,
): Promise<EvidenciaTareaDTO> {
  return apiFetch<EvidenciaTareaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/evidencias`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeTaskEvidence(idProyecto: number, idTarea: number, idEvidencia: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/evidencias/${idEvidencia}`, {
    method: 'DELETE',
  });
}

/** MEJ-52 */
export function getTaskTemplates(idProyecto: number): Promise<PlantillaTareaDTO[]> {
  return apiFetch<PlantillaTareaDTO[]>(`/proyectos/${idProyecto}/plantillas-tarea`);
}

export function createTaskTemplate(idProyecto: number, input: CreatePlantillaTareaInput): Promise<PlantillaTareaDTO> {
  return apiFetch<PlantillaTareaDTO>(`/proyectos/${idProyecto}/plantillas-tarea`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteTaskTemplate(idProyecto: number, idPlantilla: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/plantillas-tarea/${idPlantilla}`, { method: 'DELETE' });
}

/** MEJ-109: reemplaza el conjunto de responsables ADICIONALES (el principal se cambia con asignar). */
export function setTaskResponsables(idProyecto: number, idTarea: number, idsUsuarios: number[]): Promise<TareaPublicaDTO> {
  return apiFetch<TareaPublicaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/responsables`, {
    method: 'PUT',
    body: JSON.stringify({ idsUsuarios }),
  });
}

/** MEJ-107 */
export function getTaskLinks(idProyecto: number, idTarea: number): Promise<EnlaceTareaDTO[]> {
  return apiFetch<EnlaceTareaDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/enlaces`);
}

export function addTaskLink(idProyecto: number, idTarea: number, url: string): Promise<EnlaceTareaDTO> {
  return apiFetch<EnlaceTareaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/enlaces`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function removeTaskLink(idProyecto: number, idTarea: number, idEnlace: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/enlaces/${idEnlace}`, { method: 'DELETE' });
}
