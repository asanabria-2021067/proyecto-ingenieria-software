import { apiFetch } from '@/lib/api/client';
import type { CreateTimeRecordInput, RegistroTiempoTareaDTO } from '@/lib/types/tasks';

/** HU-142 (T-170) — `GET /proyectos/:projectId/tareas/:taskId/horas`. */
export function getHorasTarea(idProyecto: number, idTarea: number): Promise<RegistroTiempoTareaDTO[]> {
  return apiFetch<RegistroTiempoTareaDTO[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/horas`);
}

/** HU-142 (T-170) — `POST /proyectos/:projectId/tareas/:taskId/horas`. */
export function registrarHorasTarea(
  idProyecto: number,
  idTarea: number,
  input: CreateTimeRecordInput,
): Promise<RegistroTiempoTareaDTO> {
  return apiFetch<RegistroTiempoTareaDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/horas`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
