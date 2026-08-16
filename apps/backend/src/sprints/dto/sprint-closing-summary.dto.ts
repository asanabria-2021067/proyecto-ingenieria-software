/**
 * Rol que un participante ocupa dentro del proyecto (person-centric, mismo
 * contrato conceptual que TeamSummaryRoleDto en projects/dto/team-summary-member.dto.ts).
 * Una persona con varios roles en el proyecto aparece con varios elementos
 * aquí, nunca como varias entradas de `SprintClosingSummaryParticipantDto`.
 */
export interface SprintClosingSummaryRoleDto {
  idRolProyecto: number;
  nombreRol: string;
}

/**
 * Contrato de un participante dentro de
 * `GET /proyectos/:projectId/sprints/:sprintId/resumen-cierre` (A8).
 *
 * Person-centric: cada persona aparece una única vez, sin importar cuántas
 * `ParticipacionProyecto` (roles) tenga en el proyecto — mismo invariante que
 * `TeamSummaryMemberDto` (projects/dto/team-summary-member.dto.ts).
 *
 * `tareasRealizadas` cuenta identidad de `Tarea` (idTarea distinto), nunca
 * tramos de `AsignacionTarea`: una misma tarea con varios tramos históricos
 * del mismo usuario cuenta una sola vez.
 *
 * `horasReportadas`/`horasCalculadas`/`horasAprobadas` son la suma, por
 * usuario, de las columnas homónimas de `HorasParticipacion` para ESTE
 * Sprint (`HorasParticipacion.idSprint = sprintId`) — A8 solo lee lo ya
 * persistido por A5/A7; nunca recalcula ni muta.
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
}

/**
 * Contrato de respuesta de
 * `GET /proyectos/:projectId/sprints/:sprintId/resumen-cierre` (A8).
 */
export interface SprintClosingSummaryDto {
  idProyecto: number;
  idSprint: number;
  participantes: SprintClosingSummaryParticipantDto[];
}
