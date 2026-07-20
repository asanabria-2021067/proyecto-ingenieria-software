import { apiFetch } from '@/lib/api/client';
import { Tarea, EstadoTarea } from '@/types';

export async function getTareasByProyecto(idProyecto: number): Promise<Tarea[]> {
  return apiFetch<Tarea[]>(`/tareas?idProyecto=${idProyecto}`);
}

export interface UpdateEstadoTareaPayload {
  estadoTarea: EstadoTarea;
  orden?: number;
}

export async function updateEstadoTarea(
  id: number,
  payload: UpdateEstadoTareaPayload,
): Promise<Tarea> {
  return apiFetch<Tarea>(`/tareas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
