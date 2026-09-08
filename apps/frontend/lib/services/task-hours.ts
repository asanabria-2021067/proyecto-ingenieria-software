import { apiFetch } from '@/lib/api/client';
import type {
  CreateTimeRecordInput,
  RegistroTiempoTareaDTO,
  TaskHoursSummaryDTO,
  UpdateTimeRecordInput,
} from '@/lib/types/tasks';

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

// ─── Sprint 7 (C067/C061/C062) ───────────────────────────────────────────────

/** `GET /proyectos/:projectId/tareas/:taskId/horas/resumen` — resumen autoritativo (flags + KPIs). */
export function getTaskHoursSummary(idProyecto: number, idTarea: number): Promise<TaskHoursSummaryDTO> {
  return apiFetch<TaskHoursSummaryDTO>(`/proyectos/${idProyecto}/tareas/${idTarea}/horas/resumen`);
}

/** `PATCH /proyectos/:projectId/tareas/:taskId/horas/:recordId` — edita un registro propio. */
export function updateTimeRecord(
  idProyecto: number,
  idTarea: number,
  idRegistro: number,
  input: UpdateTimeRecordInput,
): Promise<RegistroTiempoTareaDTO> {
  return apiFetch<RegistroTiempoTareaDTO>(
    `/proyectos/${idProyecto}/tareas/${idTarea}/horas/${idRegistro}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

/** `DELETE /proyectos/:projectId/tareas/:taskId/horas/:recordId` — revoca (soft) un registro propio. */
export function revokeTimeRecord(
  idProyecto: number,
  idTarea: number,
  idRegistro: number,
): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/horas/${idRegistro}`, {
    method: 'DELETE',
  });
}
