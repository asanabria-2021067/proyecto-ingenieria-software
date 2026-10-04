import { EstadoSprint } from '@prisma/client';
import type { SituacionSprint } from '../sprint-temporal-status';

/**
 * Contrato de `GET /admin/sprints/calendario`: metadata TEMPORAL de los
 * Sprints operables de proyectos activos, para supervisión administrativa.
 * Un mismo payload sirve a la vista de mes (agrupar por `fechaFinPlaneada`),
 * a la lista y al resumen del dashboard.
 *
 * Deliberadamente no incluye nada operativo del Sprint ni del equipo
 * (tareas, hitos, horas, miembros, congelado de cierre, quién cerró): el
 * administrador supervisa el calendario, no opera dentro del Sprint.
 */

/** Líder actual del proyecto, con el mismo mínimo que la bandeja administrativa. */
export interface AdminSprintCalendarLiderDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

/** Situaciones posibles de un Sprint operable (las históricas no viajan aquí). */
export type SituacionSprintOperable = Extract<
  SituacionSprint,
  'EN_CURSO' | 'VENCE_HOY' | 'PLAN_VENCIDO' | 'EN_FINALIZACION' | 'SIN_FECHA'
>;

export interface AdminSprintCalendarItemDto {
  idSprint: number;
  numero: number;
  estado: EstadoSprint;
  idProyecto: number;
  tituloProyecto: string;
  lider: AdminSprintCalendarLiderDto;
  /** Instante ISO 8601 en que el servidor inició el Sprint. */
  fechaInicio: string;
  /**
   * Día calendario `YYYY-MM-DD` en que se espera terminar el trabajo — no el
   * cierre formal. Sin hora ni zona, para que ningún cliente lo desplace.
   * `null` en Sprints anteriores a la planificación obligatoria.
   */
  fechaFinPlaneada: string | null;
  /** Instante ISO 8601 en que terminó el trabajo normal; `null` si sigue ACTIVO. */
  fechaFinalizacionIniciada: string | null;
  /** Instante ISO 8601 del cierre formal; `null` mientras el Sprint sea operable. */
  fechaCierre: string | null;
  situacion: SituacionSprint;
  /** Plan menos hoy, en días calendario de Guatemala; negativo si ya venció. */
  diasRestantes: number | null;
  /** Fin operativo menos plan, en días calendario; negativo si fue antes. */
  desviacionDias: number | null;
}

export type AdminSprintCalendarConteosDto = Record<SituacionSprintOperable, number>;

export interface AdminSprintCalendarResumenDto {
  /** Sprints ACTIVO cuyo plan cae entre hoy y hoy + 7 días, ambos inclusive. */
  proximos7Dias: number;
  /** Sprints ACTIVO cuyo plan ya pasó. */
  planVencido: number;
}

export interface AdminSprintCalendarResponseDto {
  /** Día actual `YYYY-MM-DD` en America/Guatemala con el que se clasificó todo. */
  hoy: string;
  items: AdminSprintCalendarItemDto[];
  conteos: AdminSprintCalendarConteosDto;
  resumen: AdminSprintCalendarResumenDto;
}
