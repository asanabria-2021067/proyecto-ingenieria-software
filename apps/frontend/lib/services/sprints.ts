import { apiFetch } from '@/lib/api/client';
import type {
  AdjustSprintHoursInput,
  SprintAnalyticsDto,
  SprintClosingSummaryDto,
  SprintComparativeAnalyticsDto,
  SprintDetailDto,
  SprintDto,
} from '@/lib/types/sprints';

export function getProjectSprints(idProyecto: number): Promise<SprintDto[]> {
  return apiFetch<SprintDto[]>(`/proyectos/${idProyecto}/sprints`);
}

/** Detalle histórico — `GET /proyectos/:id/sprints/:sprintId` (A10/A12, `SprintsService.getSprintDetail`). */
export function getSprintDetail(idProyecto: number, idSprint: number): Promise<SprintDetailDto> {
  return apiFetch<SprintDetailDto>(`/proyectos/${idProyecto}/sprints/${idSprint}`);
}

export function startSprint(idProyecto: number): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints`, {
    method: 'POST',
  });
}

export function finalizeSprint(idProyecto: number, idSprint: number): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/finalizar`, {
    method: 'POST',
  });
}

export function closeSprint(idProyecto: number, idSprint: number): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/cerrar`, {
    method: 'POST',
  });
}

/** SprintClosingSummary (F5) — `GET /proyectos/:id/sprints/:sprintId/resumen-cierre` (A8/A8.1). */
export function getSprintClosingSummary(
  idProyecto: number,
  idSprint: number,
): Promise<SprintClosingSummaryDto> {
  return apiFetch<SprintClosingSummaryDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/resumen-cierre`);
}

/**
 * Ajusta horas reconocidas de UNA participación (A7) —
 * `PATCH /proyectos/:id/sprints/:sprintId/horas/:idParticipacion`.
 */
export function adjustSprintHours(
  idProyecto: number,
  idSprint: number,
  idParticipacion: number,
  input: AdjustSprintHoursInput,
): Promise<unknown> {
  return apiFetch(`/proyectos/${idProyecto}/sprints/${idSprint}/horas/${idParticipacion}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Analítica individual de un Sprint (T-172) — `GET /proyectos/:id/sprints/:sprintId/analytics`. */
export function getSprintAnalytics(idProyecto: number, idSprint: number): Promise<SprintAnalyticsDto> {
  return apiFetch<SprintAnalyticsDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/analytics`);
}

/** Analítica comparativa entre Sprints del proyecto (T-173) — `GET /proyectos/:id/sprints/analytics`. */
export function getSprintsAnalytics(idProyecto: number): Promise<SprintComparativeAnalyticsDto> {
  return apiFetch<SprintComparativeAnalyticsDto>(`/proyectos/${idProyecto}/sprints/analytics`);
}
