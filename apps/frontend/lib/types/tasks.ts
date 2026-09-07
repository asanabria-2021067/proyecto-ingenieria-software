/**
 * Contrato canónico del recurso de tarea del módulo de gestión de tareas.
 * Refleja exactamente `TareaPublica`/`mapTarea` en
 * apps/backend/src/tasks/tasks.service.ts — endpoints
 * `/proyectos/:projectId/tareas*`.
 *
 * No confundir con `TareaDTO` en `@/lib/dto/project.dto`: ese tipo refleja
 * el select embebido y más angosto de `ProjectsService` (`GET /proyectos/:id`),
 * un contrato de backend distinto que no incluye rol, asignación ni
 * etiquetas.
 */

export type EstadoTarea = 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';

export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA';

export interface UsuarioAsignadoResumen {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface AsignacionActivaTareaDTO {
  idAsignacion: number;
  idUsuario: number;
  fechaAsignacion: string;
  usuario: UsuarioAsignadoResumen;
}

export interface RolProyectoResumenTarea {
  idRolProyecto: number;
  nombreRol: string;
}

export interface HitoResumenTarea {
  idHito: number;
  tituloHito: string;
}

export interface EtiquetaTareaDTO {
  idEtiqueta: number;
  nombreEtiqueta: string;
  nombreNormalizado: string;
  color: string;
}

export interface TareaPublicaDTO {
  idTarea: number;
  idProyecto: number;
  idHito: number | null;
  idRolProyecto: number | null;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  creadaPor: number;
  fechaCreacion: string;
  fechaLimite: string | null;
  actualizadaEn: string | null;
  tiempoEstimadoHoras: number | null;
  asignacionActiva: AsignacionActivaTareaDTO | null;
  rolProyecto: RolProyectoResumenTarea | null;
  hito: HitoResumenTarea | null;
  etiquetas: EtiquetaTareaDTO[];
  cantidadComentarios: number;
}

/** Body de `POST /proyectos/:projectId/tareas` — equivalente a `CreateTaskDto`. */
export interface CreateTaskInput {
  tituloTarea: string;
  descripcionTarea?: string;
  fechaLimite: string;
  prioridad: Prioridad;
  tiempoEstimadoHoras?: number;
  idHito?: number;
  idRolProyecto?: number;
  idUsuarioAsignado?: number;
  idsEtiquetas?: number[];
}

/** Body de `PATCH /proyectos/:projectId/tareas/:taskId` — equivalente a `UpdateTaskDto`. */
export interface UpdateTaskInput {
  tituloTarea?: string;
  descripcionTarea?: string;
  fechaLimite?: string;
  prioridad?: Prioridad;
  tiempoEstimadoHoras?: number;
  idHito?: number | null;
  idRolProyecto?: number | null;
  idsEtiquetas?: number[];
}

/** Body de `PATCH /proyectos/:projectId/tareas/:taskId/estado` — equivalente a `UpdateTaskEstadoDto`. */
export interface UpdateTaskStateInput {
  estadoTarea: EstadoTarea;
}

/** Body de `POST /proyectos/:projectId/tareas/:taskId/asignar` — equivalente a `AssignTaskDto`. */
export interface AssignTaskInput {
  idUsuario: number;
}

/**
 * Body de `POST /proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/cerrar`
 * (B2) — equivalente a `CloseAssignmentDto`. `contenidoAvance` viaja ya
 * recortado (mismo `@Transform` que el backend aplica antes de validar los
 * 200 caracteres). `marcarComoHecha` siempre se envía explícito (el DTO lo
 * acepta como boolean opcional, pero `false` explícito es un valor válido
 * idéntico a omitirlo).
 */
export interface CloseAssignmentInput {
  horasReales: number;
  contenidoAvance: string;
  marcarComoHecha: boolean;
}

/**
 * Forma real de cada elemento de `GET /proyectos/:projectId/tareas/:taskId/horas`
 * (HU-142/T-170) — un evento individual de tiempo trabajado, distinto de
 * `AsignacionTarea.horasReales` (el total ya acumulado del tramo) y de las
 * horas aprobadas por Sprint (`HorasParticipacion.horasAprobadas`, ver
 * `@/lib/dto/member-detail.dto`): "horas registradas" aquí es autorreportado
 * por quien trabajó la tarea y todavía no implica aprobación.
 */
export interface RegistroTiempoTareaDTO {
  idRegistroTiempo: number;
  idAsignacion: number;
  idUsuario: number;
  horas: number;
  fecha: string;
  nota: string | null;
  creadoEn: string;
  usuario: UsuarioAsignadoResumen;
}

/** Body de `POST /proyectos/:projectId/tareas/:taskId/horas` — equivalente a `CreateTimeRecordDto`. */
export interface CreateTimeRecordInput {
  horas: number;
  fecha: string;
  nota?: string;
  /** S7: obligatoria solo cuando ESTA operación cruza la estimación (antes ≤ estimación ∧ después > estimación). */
  justificacionExceso?: string;
}

// ─── Sprint 7 — horas granulares (06 v2 §46, C067) ───────────────────────────

/** Origen del tramo de horas: granular (registros), legacy (histórico sin registros) o por conciliar. */
export type OrigenReporteTramo = 'GRANULAR' | 'LEGACY' | 'POR_CONCILIAR';

/**
 * Tramo de horas dentro del resumen autoritativo de la tarea. Los importes
 * viajan como string decimal de dos posiciones — se formatean, nunca se
 * convierten a `Number` para mostrarlos.
 */
export interface TramoHorasResumenDTO {
  idAsignacion: number;
  usuario: UsuarioAsignadoResumen;
  idParticipacion: number | null;
  rolHistorico: { idRolProyecto: number; nombreRol: string } | null;
  abierto: boolean;
  origen: OrigenReporteTramo;
  reportadas: string;
  ajuste: string | null;
  propuestas: string;
  reconocidoEn: string | null;
  justificaciones: string[];
}

/**
 * `GET /proyectos/:projectId/tareas/:taskId/horas/resumen` — única fuente
 * correcta de estimación, reportadas, restantes, exceso y de los flags
 * `puedeCrear/puedeEditar/puedeRevocar`, que gobiernan la UI.
 *
 * `restantes` y `sobreEstimacion` son `null` (no `0`) cuando
 * `estimacion === null`: «no hay umbral» no es «el umbral es cero».
 */
export interface TaskHoursSummaryDTO {
  taskId: number;
  sprintId: number;
  estimacion: number | null;
  horasReportadasTarea: string;
  horasLegacyNoGranulares: string;
  restantes: string | null;
  sobreEstimacion: string | null;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeRevocar: boolean;
  tramos: TramoHorasResumenDTO[];
}

/**
 * Body de `PATCH /proyectos/:projectId/tareas/:taskId/horas/:recordId` —
 * equivalente a `UpdateTimeRecordDto`. `nota: null` RETIRA la nota;
 * `undefined` la conserva; la cadena vacía se rechaza.
 */
export interface UpdateTimeRecordInput {
  horas?: number;
  fecha?: string;
  nota?: string | null;
  justificacionExceso?: string;
}
