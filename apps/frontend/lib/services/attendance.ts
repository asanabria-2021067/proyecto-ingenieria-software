import { apiFetch } from '@/lib/api/client';
import type { ActividadDetalle, ActividadResumen, AsistenciaPublica } from '@/lib/types/attendance';

/** T-296 — `GET /proyectos/:id/actividades` (lectura con scope `asistencia`). */
export function getProjectActividades(idProyecto: number): Promise<ActividadResumen[]> {
  return apiFetch<ActividadResumen[]>(`/proyectos/${idProyecto}/actividades`);
}

/** T-296 — `GET /proyectos/:id/actividades/:actividadId`: la actividad con la asistencia de cada integrante activo. */
export function getActividadDetalle(idProyecto: number, idActividad: number): Promise<ActividadDetalle> {
  return apiFetch<ActividadDetalle>(`/proyectos/${idProyecto}/actividades/${idActividad}`);
}

/** T-296/T-297 — marca, corrige o quita la asistencia de un integrante. Exclusivo del líder (ACTIVIDAD_ASISTENCIA). */
export function marcarAsistencia(
  idProyecto: number,
  idActividad: number,
  idUsuario: number,
  asistio: boolean,
): Promise<AsistenciaPublica> {
  return apiFetch<AsistenciaPublica>(`/proyectos/${idProyecto}/actividades/${idActividad}/asistencia/${idUsuario}`, {
    method: 'PATCH',
    body: JSON.stringify({ asistio }),
  });
}
