/**
 * Forma real de la respuesta del endpoint `GET /proyectos/:id/equipo/:idUsuario`
 * (`ProjectsController.findTeamMemberDetail` / `ProjectsService.findTeamMemberDetail`,
 * apps/backend/src/projects/projects.service.ts). Exclusivo del líder del
 * proyecto: participación(es) del integrante, historial de tareas con
 * asignación (activa o pasada) y horas por tarea.
 *
 * No confundir con `MiembroProyectoResumenDTO` en `@/lib/dto/member.dto`: ese
 * contrato describe el resumen futuro de HU-123/HU-124 (T-106) para la lista
 * de equipo, todavía sin endpoint propio; este archivo describe el detalle
 * individual, ya implementado.
 */

import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';
import type { EstadoSprint } from '@/lib/types/sprints';

export interface UsuarioDetalleIntegranteDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}

export interface RolProyectoResumenDTO {
  idRolProyecto: number;
  nombreRol: string;
}

export interface ParticipacionIntegranteDTO {
  idParticipacion: number;
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
  fechaIngreso: string;
  fechaSalida: string | null;
  rolProyecto: RolProyectoResumenDTO;
}

export interface TareaHistorialIntegranteDTO {
  idTarea: number;
  /** Sprint al que pertenece la tarea (B14) — toda tarea tiene exactamente un Sprint (idSprint no nulo en el modelo). */
  idSprint: number;
  tituloTarea: string;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  fechaCreacion: string;
  fechaLimite: string | null;
  actualizadaEn: string | null;
  tiempoEstimadoHoras: number | null;
  horasReales: number | null;
  fechaAsignacion: string;
  desasignadaEn: string | null;
}

export type EstadoRegistroHoras = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

/**
 * Un registro individual de `HorasParticipacion` dentro de un Sprint (B14).
 * No se usa hoy en la UI de F15 (que solo consume los agregados
 * `horasCalculadas`/`horasAprobadas` del grupo), pero se tipa igual para que
 * el contrato refleje exactamente lo que retorna el backend.
 */
export interface RegistroHorasSprintDTO {
  idRegistroHoras: number;
  idParticipacion: number;
  estadoHoras: EstadoRegistroHoras;
  horasCalculadas: number | null;
  horasAprobadas: number | null;
}

/**
 * Un grupo de historial por Sprint (B14 — `TeamService.findTeamMemberDetail`,
 * campo `sprints`). `horasAprobadas` es la suma de `horasParticipacion`
 * ya APROBADAS de ese Sprint (horas "reconocidas"): un concepto distinto e
 * independiente de `TareaHistorialIntegranteDTO.horasReales`, que es horas
 * reales trabajadas por tarea. No derivar uno del otro.
 *
 * `tareas` aquí es el mismo objeto de tarea que aparece en el `tareas` plano
 * de `DetalleIntegranteProyectoDTO`, ya particionado por Sprint por el
 * backend — nunca reconstruir esta partición en el frontend.
 */
export interface HistorialSprintIntegranteDTO {
  idSprint: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: string;
  fechaFinalizacionIniciada: string | null;
  fechaCierre: string | null;
  horasCalculadas: number;
  horasAprobadas: number;
  tareas: TareaHistorialIntegranteDTO[];
  registrosHoras: RegistroHorasSprintDTO[];
}

export interface DetalleIntegranteProyectoDTO {
  usuario: UsuarioDetalleIntegranteDTO;
  participaciones: ParticipacionIntegranteDTO[];
  tareas: TareaHistorialIntegranteDTO[];
  /** Historial agrupado por Sprint (B14) — orden ascendente por `numero`, no garantizado descendente. */
  sprints: HistorialSprintIntegranteDTO[];
}
