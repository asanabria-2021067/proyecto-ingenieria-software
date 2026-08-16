/**
 * Contrato canónico del recurso de Sprint. Refleja exactamente
 * `SprintListItemDto` (apps/backend/src/sprints/dto/sprint-history.dto.ts) —
 * `GET /proyectos/:projectId/sprints` — y la fila `Sprint` que devuelven
 * `startSprint`/`finalizeSprint`/`closeSprint` en
 * apps/backend/src/sprints/sprints.service.ts, un superconjunto compatible
 * de los mismos campos base (más `cerradoPor`, opcional aquí porque
 * `listSprints` no lo selecciona).
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
