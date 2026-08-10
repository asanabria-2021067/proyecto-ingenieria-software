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

export interface DetalleIntegranteProyectoDTO {
  usuario: UsuarioDetalleIntegranteDTO;
  participaciones: ParticipacionIntegranteDTO[];
  tareas: TareaHistorialIntegranteDTO[];
}
