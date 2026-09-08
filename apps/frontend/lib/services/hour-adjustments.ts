import { apiFetch } from '@/lib/api/client';
import type { AjusteHoraDTO, UpsertHourAdjustmentInput } from '@/lib/types/sprints';

function base(idProyecto: number, idSprint: number, idAsignacion: number): string {
  return `/proyectos/${idProyecto}/sprints/${idSprint}/asignaciones/${idAsignacion}/ajuste-horas`;
}

/** E072 — cadena completa de ajustes del tramo (anulados incluidos), el vigente primero si existe. */
export function getHourAdjustment(
  idProyecto: number,
  idSprint: number,
  idAsignacion: number,
): Promise<AjusteHoraDTO[]> {
  return apiFetch<AjusteHoraDTO[]>(base(idProyecto, idSprint, idAsignacion));
}

/** E070 — registrar o corregir el ajuste vigente del tramo. `deltaHoras` es un delta con signo. */
export function upsertHourAdjustment(
  idProyecto: number,
  idSprint: number,
  idAsignacion: number,
  input: UpsertHourAdjustmentInput,
): Promise<AjusteHoraDTO> {
  return apiFetch<AjusteHoraDTO>(base(idProyecto, idSprint, idAsignacion), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E071 — revertir el ajuste vigente (204 también cuando no hay vigente). */
export function deleteHourAdjustment(
  idProyecto: number,
  idSprint: number,
  idAsignacion: number,
): Promise<void> {
  return apiFetch<void>(base(idProyecto, idSprint, idAsignacion), { method: 'DELETE' });
}
