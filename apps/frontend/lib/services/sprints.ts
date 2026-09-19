import { apiFetch } from '@/lib/api/client';
import type {
  SprintAnalyticsDto,
  SprintBurndownDto,
  SprintClosingMemberTotalsDto,
  SprintClosingSummaryDto,
  SprintComparativeAnalyticsDto,
  SprintDetailDto,
  SprintDto,
  DestinoArrastre,
} from '@/lib/types/sprints';

export function getProjectSprints(idProyecto: number): Promise<SprintDto[]> {
  return apiFetch<SprintDto[]>(`/proyectos/${idProyecto}/sprints`);
}

/** Detalle histórico — `GET /proyectos/:id/sprints/:sprintId` (A10/A12, `SprintsService.getSprintDetail`). */
export function getSprintDetail(idProyecto: number, idSprint: number): Promise<SprintDetailDto> {
  return apiFetch<SprintDetailDto>(`/proyectos/${idProyecto}/sprints/${idSprint}`);
}

/** HU-160: fechaFinPlaneada es opcional — si se omite, el backend calcula fechaInicio + 14 días. */
export function startSprint(idProyecto: number, fechaFinPlaneada?: string): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints`, {
    method: 'POST',
    body: JSON.stringify(fechaFinPlaneada ? { fechaFinPlaneada } : {}),
  });
}

export function finalizeSprint(idProyecto: number, idSprint: number): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/finalizar`, {
    method: 'POST',
  });
}

export function closeSprint(idProyecto: number, idSprint: number, destino?: DestinoArrastre): Promise<SprintDto> {
  return apiFetch<SprintDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/cerrar`, {
    method: 'POST',
    body: JSON.stringify(destino ? { destino } : {}),
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
 * S7 — desglose por tramo de UN integrante en el cierre
 * (`GET /proyectos/:id/sprints/:sprintId/resumen-cierre/miembros/:userId`).
 * El ajuste por participación (E063) fue retirado: corregir horas es potestad
 * del ajuste por asignación (`lib/services/hour-adjustments.ts`).
 */
export function getSprintClosingMemberDetail(
  idProyecto: number,
  idSprint: number,
  idUsuario: number,
): Promise<SprintClosingMemberTotalsDto> {
  return apiFetch<SprintClosingMemberTotalsDto>(
    `/proyectos/${idProyecto}/sprints/${idSprint}/resumen-cierre/miembros/${idUsuario}`,
  );
}

/** Analítica individual de un Sprint (T-172) — `GET /proyectos/:id/sprints/:sprintId/analytics`. */
export function getSprintAnalytics(idProyecto: number, idSprint: number): Promise<SprintAnalyticsDto> {
  return apiFetch<SprintAnalyticsDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/analytics`);
}

/** Analítica comparativa entre Sprints del proyecto (T-173) — `GET /proyectos/:id/sprints/analytics`. */
export function getSprintsAnalytics(idProyecto: number): Promise<SprintComparativeAnalyticsDto> {
  return apiFetch<SprintComparativeAnalyticsDto>(`/proyectos/${idProyecto}/sprints/analytics`);
}

/** Burndown de un Sprint (T-240, HU-160) — `GET /proyectos/:id/sprints/:sprintId/burndown`. */
export function getSprintBurndown(idProyecto: number, idSprint: number): Promise<SprintBurndownDto> {
  return apiFetch<SprintBurndownDto>(`/proyectos/${idProyecto}/sprints/${idSprint}/burndown`);
}
