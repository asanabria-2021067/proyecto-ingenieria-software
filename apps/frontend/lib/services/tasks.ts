import { apiFetch } from '@/lib/api/client';
import type {
  AssignTaskInput,
  CreateTaskInput,
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

export function deleteTask(idProyecto: number, idTarea: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}`, {
    method: 'DELETE',
  });
}
