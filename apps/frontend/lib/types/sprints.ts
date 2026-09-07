/**
 * Contrato canónico del recurso de Sprint. Refleja exactamente
 * `SprintListItemDto` (apps/backend/src/sprints/dto/sprint-history.dto.ts) —
 * `GET /proyectos/:projectId/sprints` — y la fila `Sprint` que devuelven
 * `startSprint`/`finalizeSprint`/`closeSprint` en
 * apps/backend/src/sprints/sprints.service.ts, un superconjunto compatible
 * de los mismos campos base (más `cerradoPor`, opcional aquí porque
 * `listSprints` no lo selecciona; y `tareas`/`hitos`/`horasEstimadas`
 * — A10.1 —, opcionales por el motivo inverso: las mutaciones devuelven la
 * fila cruda de `Sprint`, que nunca las calcula).
 *
 * Fechas como `string`: igual que `TareaPublicaDTO` en `@/lib/types/tasks`,
 * son JSON serializado por `apiFetch`, nunca instancias de `Date`.
 */

import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';

export type EstadoSprint = 'ACTIVO' | 'EN_FINALIZACION' | 'CERRADO';

export interface SprintDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: string;
  fechaFinalizacionIniciada: string | null;
  fechaCierre: string | null;
  cerradoPor?: number | null;
  /** A10.1 — presente en `GET /proyectos/:id/sprints`, ausente en las mutaciones. */
  tareas?: number;
  hitos?: number;
  horasEstimadas?: number;
}

/**
 * Contrato de detalle histórico — `GET /proyectos/:projectId/sprints/:sprintId`
 * (A10/A12, `SprintsService.getSprintDetail`). Refleja exactamente
 * `SprintDetailDto` y sus tipos anidados
 * (apps/backend/src/sprints/dto/sprint-history.dto.ts:80-104): reconstruido
 * desde las tablas relacionales actuales (no hay tabla de snapshot), pero es
 * de solo lectura para el frontend — F4 nunca muta nada de este árbol.
 */

/** Mismo subconjunto público de Usuario que `autorSelect`/`HISTORY_USUARIO_SELECT` — nunca el objeto completo. */
export interface SprintHistoryUsuarioDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

/** Un tramo histórico de asignación — incluye tramos ya cerrados (`desasignadaEn` no nulo). */
export interface SprintDetailAsignacionDto {
  idAsignacion: number;
  usuario: SprintHistoryUsuarioDto;
  fechaAsignacion: string;
  desasignadaEn: string | null;
  horasReales: number | null;
}

export interface SprintDetailComentarioDto {
  idComentario: number;
  autor: SprintHistoryUsuarioDto;
  contenido: string;
  creadoEn: string;
}

export interface SprintDetailTareaDto {
  idTarea: number;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  idHito: number | null;
  fechaCreacion: string;
  fechaLimite: string | null;
  tiempoEstimadoHoras: number | null;
  asignaciones: SprintDetailAsignacionDto[];
  comentarios: SprintDetailComentarioDto[];
}

export type EstadoHito = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO';

/**
 * `porcentaje` viene precalculado por el backend (`calcularProgresoHito`,
 * misma fórmula canónica que `ProjectsService.calcularAvanceHitos`) sobre
 * TODAS las tareas vigentes del Hito en el proyecto, no solo las de este
 * Sprint — F4 nunca lo recalcula.
 */
export interface SprintDetailHitoDto {
  idHito: number;
  tituloHito: string;
  estadoHito: EstadoHito;
  porcentaje: number;
}

export interface SprintDetailDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: string;
  fechaFinalizacionIniciada: string | null;
  fechaCierre: string | null;
  cerradoPor: number | null;
  tareas: SprintDetailTareaDto[];
  hitos: SprintDetailHitoDto[];
}

/**
 * Contrato de `SprintClosingSummary` — `GET /proyectos/:id/sprints/:sprintId/resumen-cierre`
 * (A8/A8.1, `SprintsService.getSprintClosingSummary`). Refleja exactamente
 * `SprintClosingSummaryDto` y sus tipos anidados
 * (apps/backend/src/sprints/dto/sprint-closing-summary.dto.ts). F5 lo
 * consume tal cual — nunca recalcula tareasRealizadas/horas* en React.
 */
export interface SprintClosingSummaryRoleDto {
  idRolProyecto: number;
  nombreRol: string;
}

/**
 * Una `ParticipacionProyecto` individual dentro del desglose de un
 * participante (A8.1) — la única forma del contrato que expone
 * `idParticipacion`, que S7 usa para mapear cada tramo a su rol (el ajuste
 * por participación, E063, fue retirado: hoy se ajusta por asignación).
 *
 * `horasCalculadas`/`horasAprobadas` son `number | null` porque reflejan la
 * columna backend tal cual: A5 puede no haber calculado nada todavía, y
 * `horasAprobadas` permanece `null` hasta el primer ajuste A7 — F5 no debe
 * normalizar ese `null` a 0 al leerlo (solo al decidir un valor inicial de
 * formulario, una decisión de UI, nunca del contrato).
 */
export interface SprintClosingSummaryParticipationDto {
  idParticipacion: number;
  idRolProyecto: number;
  nombreRol: string;
  horasReportadas: number;
  horasCalculadas: number | null;
  horasAprobadas: number | null;
  justificacionAjuste: string | null;
}

/**
 * Person-centric: cada persona aparece una única vez, sin importar cuántas
 * `ParticipacionProyecto` (roles) tenga en el proyecto.
 * `horasReportadas`/`horasCalculadas`/`horasAprobadas` son
 * `SUM(participaciones[].horas*)`, ya agregado por el backend.
 */
export interface SprintClosingSummaryParticipantDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  roles: SprintClosingSummaryRoleDto[];
  tareasRealizadas: number;
  horasReportadas: number;
  horasCalculadas: number;
  horasAprobadas: number;
  participaciones: SprintClosingSummaryParticipationDto[];
  /** S7 C079 (§46): desglose por tramos y ajustes. Aditivo; nunca editable. */
  totales?: SprintClosingMemberTotalsDto;
}

/**
 * S7 C079 (06 v2 §46): un TRAMO (`AsignacionTarea`) dentro del desglose de
 * cierre. `reportadas` es lo que reportó el integrante y `propuestas` es
 * reportadas + el ajuste vigente del líder. Los importes son string decimal
 * de dos posiciones: se formatean, nunca se operan en punto flotante.
 */
export interface SprintClosingTramoDto {
  idAsignacion: number;
  idTarea: number;
  tituloTarea: string;
  tareaEliminada: boolean;
  idParticipacion: number | null;
  abierto: boolean;
  origen: string;
  reportadas: string;
  /** Estimación de la tarea del tramo; `null` cuando nadie la estimó. */
  estimacionTarea: number | null;
  /** Reportado por encima de la estimación. `'0.00'` si no la supera o no hay. */
  exceso: string;
  /** Lo que argumentó el ESTUDIANTE al exceder su estimación, no el líder. */
  justificacionExceso: string | null;
  ajuste: string | null;
  justificacionAjuste: string | null;
  propuestas: string;
  reconocidoEn: string | null;
}

/** S7 C079: totales por integrante derivados de sus tramos; nunca editables. */
export interface SprintClosingMemberTotalsDto {
  tareasDistintas: number;
  estimacionAsociada: number | null;
  reportadas: string;
  legacy: string;
  exceso: string;
  propuestas: string;
  filasPendientes: number;
  filasConsumidas: number;
  tramos: SprintClosingTramoDto[];
}

/** S7 C079 (§22/§46): impedimento visible del cierre del Sprint. */
export interface SprintClosingBlockerDto {
  code: string;
  message: string;
  ids: number[];
  cantidad: number;
}

export interface SprintClosingSummaryDto {
  idProyecto: number;
  idSprint: number;
  /** S7 C079: el estado del Sprint forma parte del resumen (`CERRADO` ⇒ read-only). */
  estadoSprint?: string;
  participantes: SprintClosingSummaryParticipantDto[];
  /** S7 C079: lo que impide consolidar. Vacío o ausente ⇒ se puede cerrar. */
  blockers?: SprintClosingBlockerDto[];
}

/**
 * S7 — body de `POST /proyectos/:pid/sprints/:sid/asignaciones/:aid/ajuste-horas`
 * (`UpsertHourAdjustmentDto`). `deltaHoras` es un DELTA CON SIGNO en string
 * decimal (`/^[+-]?\d{1,10}(\.\d{1,2})?$/`), nunca un absoluto. La
 * justificación es obligatoria si el delta no es cero.
 */
export interface UpsertHourAdjustmentInput {
  deltaHoras: string;
  justificacion?: string;
}

/** S7 — un eslabón de la cadena de ajustes de un tramo (`AjusteHoraPublico`). */
export interface AjusteHoraDTO {
  idAjusteHora: number;
  idAsignacion: number;
  deltaHoras: string;
  horasBase: string;
  propuesta: string;
  justificacion: string | null;
  idAutor: number;
  creadoEn: string;
  anuladoEn: string | null;
  anuladoPor: number | null;
  idAjusteAnterior: number | null;
  vigente: boolean;
}

/**
 * Contrato de `GET /proyectos/:projectId/sprints/:sprintId/analytics`
 * (T-172, HU-143). Refleja exactamente `SprintAnalyticsDto`
 * (apps/backend/src/sprints/dto/sprint-analytics.dto.ts). Restricción
 * vigente: nunca "velocity" — `planificadoVsCompletado` cuenta tareas
 * ("tareas completadas por sprint"). `hitos` reutiliza el mismo shape que
 * `SprintDetailHitoDto` (F4).
 */
export interface SprintAnalyticsDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  tareasTotales: number;
  distribucionPorEstado: Record<EstadoTarea, number>;
  distribucionPorPrioridad: Record<Prioridad, number>;
  hitos: SprintDetailHitoDto[];
  planificadoVsCompletado: {
    tareasPlanificadas: number;
    tareasCompletadas: number;
    horasEstimadas: number;
  };
}

/**
 * Un elemento de `GET /proyectos/:projectId/sprints/analytics` (T-173,
 * HU-143) — refleja `SprintComparativeAnalyticsItemDto`. El campo se llama
 * literalmente `tareasCompletadas`, nunca "velocity".
 */
export interface SprintComparativeAnalyticsItemDto {
  idSprint: number;
  numero: number;
  estado: EstadoSprint;
  tareasPlanificadas: number;
  tareasCompletadas: number;
  porcentajeCumplimiento: number;
  hitosTotales: number;
  hitosCompletados: number;
}

export interface SprintComparativeAnalyticsDto {
  idProyecto: number;
  sprints: SprintComparativeAnalyticsItemDto[];
}
