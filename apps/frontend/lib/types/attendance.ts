/**
 * Contratos de HU-177 (T-296): espejo de lo que devuelve
 * apps/backend/src/attendance/attendance.service.ts. El backend no usa DTOs
 * de respuesta dedicados; estos tipos describen esos objetos tal cual.
 */

/** Espejo exacto del enum `TipoActividad` de schema.prisma. */
export type TipoActividad = 'REUNION' | 'JORNADA' | 'TALLER' | 'OTRO';

export interface ActividadPublica {
  idActividad: number;
  idProyecto: number;
  tituloActividad: string;
  tipoActividad: TipoActividad;
  /** Fecha sin hora (`YYYY-MM-DD`). */
  fechaActividad: string;
  horasValor: number;
  creadoPor: number;
  creadoEn: string;
}

/** `GET /proyectos/:projectId/actividades`. */
export interface ActividadResumen extends ActividadPublica {
  totalIntegrantes: number;
  totalAsistieron: number;
}

/**
 * Sin fila de asistencia el backend responde `asistio: false` y
 * `confirmadoEn: null`: eso es «sin registrar», distinto de una ausencia
 * confirmada por el líder (`asistio: false` con `confirmadoEn`).
 */
export interface IntegranteAsistencia {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  asistio: boolean;
  confirmadoEn: string | null;
}

/** `GET /proyectos/:projectId/actividades/:actividadId`. */
export interface ActividadDetalle extends ActividadPublica {
  integrantes: IntegranteAsistencia[];
}

/** `PATCH /proyectos/:projectId/actividades/:actividadId/asistencia/:usuarioId`. */
export interface AsistenciaPublica {
  idAsistencia: number;
  idActividad: number;
  idUsuario: number;
  asistio: boolean;
  confirmadoPor: number | null;
  confirmadoEn: string | null;
  idRegistroHoras: number | null;
}
