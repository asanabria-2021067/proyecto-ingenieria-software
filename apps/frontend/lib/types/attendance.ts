/**
 * Contrato canónico de actividades y asistencia (T-295/T-296/T-297, HU-177)
 * — refleja exactamente `ActividadPublica`/`ActividadResumen`/
 * `ActividadDetalle`/`IntegranteAsistencia`/`AsistenciaPublica`
 * (apps/backend/src/attendance/attendance.service.ts). Fechas como
 * `string`: JSON serializado por `apiFetch`, nunca instancias de `Date`.
 */

export type TipoActividad = 'REUNION' | 'JORNADA' | 'TALLER' | 'OTRO';

export interface ActividadPublica {
  idActividad: number;
  idProyecto: number;
  tituloActividad: string;
  tipoActividad: TipoActividad;
  fechaActividad: string;
  horasValor: number;
  creadoPor: number;
  creadoEn: string;
}

export interface ActividadResumen extends ActividadPublica {
  totalIntegrantes: number;
  totalAsistieron: number;
}

export interface IntegranteAsistencia {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  asistio: boolean;
  confirmadoEn: string | null;
}

export interface ActividadDetalle extends ActividadPublica {
  integrantes: IntegranteAsistencia[];
}

export interface AsistenciaPublica {
  idAsistencia: number;
  idActividad: number;
  idUsuario: number;
  asistio: boolean;
  confirmadoPor: number | null;
  confirmadoEn: string | null;
  idRegistroHoras: number | null;
}

/** `POST /proyectos/:id/actividades` — `CreateActividadDto`. */
export interface CreateActividadInput {
  tituloActividad: string;
  tipoActividad: TipoActividad;
  fechaActividad: string;
  horasValor: number;
}

/** `PATCH /proyectos/:id/actividades/:actividadId/asistencia/:usuarioId` — `MarkAttendanceDto`. */
export interface MarkAttendanceInput {
  asistio: boolean;
}
