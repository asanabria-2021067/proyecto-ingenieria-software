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
  horasReales: number | null;
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
  horasReales?: number;
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
