import { apiFetch } from '@/lib/api/client';
import type { SprintDto } from '@/lib/types/sprints';

export function getProjectSprints(idProyecto: number): Promise<SprintDto[]> {
  return apiFetch<SprintDto[]>(`/proyectos/${idProyecto}/sprints`);
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
