import { EstadoHito, EstadoSprint, EstadoTarea, Prioridad } from '@prisma/client';

/**
 * Contrato de un elemento de `GET /proyectos/:projectId/sprints` (A10 +
 * A10.1). Metadata suficiente para identificar el Sprint, navegar a su
 * detalle, y presentar el resumen de F3 sin N+1 — sigue sin incluir
 * agregaciones de A8 (SprintClosingSummary) ni datos pesados de F4
 * (tareas/hitos/asignaciones/comentarios completos), solo los tres
 * conteos/sumas necesarios para la tarjeta de lista.
 *
 * `tareas`/`hitos`/`horasEstimadas` (A10.1): agregados sobre el mismo
 * universo de tareas que `getSprintDetail` (`idProyecto` + `eliminadoEn:
 * null`) — ver `SprintsService.getSprintAggregatesByProject`. `hitos` es
 * `COUNT(DISTINCT idHito)` (nunca cuenta un mismo Hito dos veces).
 * `horasEstimadas` es `SUM(tiempoEstimadoHoras)`, nunca horas
 * reales/calculadas/aprobadas (eso es reconocimiento de A5/A7, no
 * estimación).
 */
export interface SprintListItemDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: Date;
  fechaFinalizacionIniciada: Date | null;
  fechaCierre: Date | null;
  tareas: number;
  hitos: number;
  horasEstimadas: number;
}

/**
 * Identidad pública mínima de un usuario dentro del histórico (autor de
 * comentario / usuario de una asignación) — mismo subconjunto de campos que
 * `autorSelect` en ComentariosService, nunca el objeto `Usuario` completo.
 */
export interface SprintHistoryUsuarioDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

/**
 * Un tramo histórico de `AsignacionTarea` — incluye tramos cerrados
 * (`desasignadaEn` no nulo), no solo el tramo activo: A10 reconstruye
 * historia, no el estado vigente.
 */
export interface SprintDetailAsignacionDto {
  idAsignacion: number;
  usuario: SprintHistoryUsuarioDto;
  fechaAsignacion: Date;
  desasignadaEn: Date | null;
  horasReales: number | null;
}

export interface SprintDetailComentarioDto {
  idComentario: number;
  autor: SprintHistoryUsuarioDto;
  contenido: string;
  creadoEn: Date;
}

/**
 * `idHito` es una referencia al elemento correspondiente de
 * `SprintDetailDto.hitos` (colección top-level deduplicada) — nunca el
 * objeto Hito embebido, para que un mismo Hito compartido por varias
 * tareas no se duplique.
 */
export interface SprintDetailTareaDto {
  idTarea: number;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  idHito: number | null;
  fechaCreacion: Date;
  fechaLimite: Date | null;
  tiempoEstimadoHoras: number | null;
  asignaciones: SprintDetailAsignacionDto[];
  comentarios: SprintDetailComentarioDto[];
}

/**
 * `estadoHito` es el valor persistido de `Hito.estadoHito` (A12 corrigió su
 * sincronización en TasksService — ver hito-progreso.ts — así que ya es
 * confiable; SprintDetail sigue devolviendo el campo persistido tal cual,
 * nunca un recálculo distinto). `porcentaje` se deriva con la MISMA fórmula
 * canónica (`calcularProgresoHito`), usando TODAS las tareas vigentes del
 * Hito en el proyecto (mismo scope que `ProjectsService.calcularAvanceHitos`
 * / `getAvance`) — no solo las tareas de este Sprint.
 */
export interface SprintDetailHitoDto {
  idHito: number;
  tituloHito: string;
  estadoHito: EstadoHito;
  porcentaje: number;
}

/**
 * Contrato de `GET /proyectos/:projectId/sprints/:sprintId` (A10).
 * Reconstruido desde las tablas relacionales actuales — no existe ninguna
 * tabla de snapshot/histórico; `hitos` es una colección top-level
 * deduplicada (ver `SprintDetailTareaDto.idHito`).
 */
export interface SprintDetailDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: Date;
  fechaFinalizacionIniciada: Date | null;
  fechaCierre: Date | null;
  cerradoPor: number | null;
  tareas: SprintDetailTareaDto[];
  hitos: SprintDetailHitoDto[];
}
