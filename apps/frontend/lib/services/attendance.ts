import { apiFetch } from '@/lib/api/client';
import type {
  ActividadDetalle,
  ActividadPublica,
  ActividadResumen,
  AsistenciaPublica,
  CreateActividadInput,
  MarkAttendanceInput,
} from '@/lib/types/attendance';

/** `GET /proyectos/:id/actividades` — líder e integrante activo (y admin). */
export function getProjectActivities(idProyecto: number): Promise<ActividadResumen[]> {
  return apiFetch<ActividadResumen[]>(`/proyectos/${idProyecto}/actividades`);
}

/** `GET /proyectos/:id/actividades/:actividadId` — detalle con asistencia por integrante. */
export function getProjectActivity(idProyecto: number, idActividad: number): Promise<ActividadDetalle> {
  return apiFetch<ActividadDetalle>(`/proyectos/${idProyecto}/actividades/${idActividad}`);
}

/** `POST /proyectos/:id/actividades` — exclusivo del líder. */
export function createActivity(
  idProyecto: number,
  input: CreateActividadInput,
): Promise<ActividadPublica> {
  return apiFetch<ActividadPublica>(`/proyectos/${idProyecto}/actividades`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** `PATCH /proyectos/:id/actividades/:actividadId/asistencia/:usuarioId` — exclusivo del líder. */
export function markAttendance(
  idProyecto: number,
  idActividad: number,
  idUsuario: number,
  input: MarkAttendanceInput,
): Promise<AsistenciaPublica> {
  return apiFetch<AsistenciaPublica>(
    `/proyectos/${idProyecto}/actividades/${idActividad}/asistencia/${idUsuario}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}
