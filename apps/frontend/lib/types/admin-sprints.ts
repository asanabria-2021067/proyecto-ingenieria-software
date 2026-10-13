/**
 * Contrato de `GET /admin/sprints/calendario`: metadata temporal de los
 * Sprints operables de proyectos activos, para supervisión administrativa.
 *
 * Es un tipo propio del panel de administración. No se mezcla con la agenda
 * del estudiante (tareas y eventos): aquí lo único que tiene fecha es la
 * finalización esperada de un Sprint.
 */

export type AdminSprintEstado = 'ACTIVO' | 'EN_FINALIZACION' | 'CERRADO';

/**
 * Situación temporal YA calculada por el backend con el día de Guatemala.
 * El frontend la presenta; nunca la recalcula a partir de las fechas.
 */
export type AdminSprintSituacion =
  | 'EN_CURSO'
  | 'VENCE_HOY'
  | 'PLAN_VENCIDO'
  | 'EN_FINALIZACION'
  | 'SIN_FECHA';

export interface AdminSprintCalendarLider {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

export interface AdminSprintCalendarItem {
  idSprint: number;
  numero: number;
  estado: AdminSprintEstado;
  idProyecto: number;
  tituloProyecto: string;
  lider: AdminSprintCalendarLider;
  /** Instante ISO 8601. */
  fechaInicio: string;
  /** Día calendario `YYYY-MM-DD` esperado para terminar el trabajo; no es el cierre formal. */
  fechaFinPlaneada: string | null;
  /** Instante ISO 8601; `null` mientras el Sprint siga activo. */
  fechaFinalizacionIniciada: string | null;
  /** Instante ISO 8601; `null` mientras el Sprint sea operable. */
  fechaCierre: string | null;
  situacion: AdminSprintSituacion;
  /** Plan menos hoy, en días calendario; negativo si ya venció. */
  diasRestantes: number | null;
  /** Finalización real menos plan, en días calendario. */
  desviacionDias: number | null;
}

export interface AdminSprintCalendar {
  /** Día actual `YYYY-MM-DD` en America/Guatemala con el que el backend clasificó todo. */
  hoy: string;
  items: AdminSprintCalendarItem[];
  conteos: Record<AdminSprintSituacion, number>;
  resumen: {
    proximos7Dias: number;
    planVencido: number;
  };
}
