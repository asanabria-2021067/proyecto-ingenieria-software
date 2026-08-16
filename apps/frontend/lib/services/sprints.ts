import { apiFetch } from '@/lib/api/client';
import type { SprintDetailDto, SprintDto } from '@/lib/types/sprints';

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
