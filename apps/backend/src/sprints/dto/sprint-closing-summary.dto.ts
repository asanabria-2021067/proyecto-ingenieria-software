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
 * A8.1: una `ParticipacionProyecto` individual dentro del desglose de un
 * participante. Existe porque A7 (`PATCH .../horas/:participacionId`) opera
 * sobre una participación concreta, nunca sobre una persona agregada — este
 * es el único lugar del contrato que expone `idParticipacion`, imprescindible
 * para que F5 pueda construir ese PATCH en el caso multirol.
 *
 * `horasCalculadas`/`horasAprobadas` son `number | null` porque reflejan
 * exactamente la columna `HorasParticipacion` (Decimal nullable): A5 puede
 * no haber calculado nada todavía (`horasCalculadas: null`), y `horasAprobadas`
 * permanece `null` hasta que A7 la ajusta explícitamente por primera vez — A8.1
 * nunca normaliza estos `null` a 0 ni a `horasCalculadas` (esa sería una regla
 * de negocio inventada en el read-model; la decisión de qué mostrar/editar en
 * ausencia de valor es responsabilidad de la UI consumidora).
 * `horasReportadas` sí es siempre un número real: la columna no es nullable.
 *
 * `justificacionAjuste` es la ya persistida por un ajuste A7 previo (o
 * `null` si nunca se ajustó) — nunca se sobreescribe a `null` por defecto,
 * para que F5 pueda reconstruir el formulario fielmente si el líder
 * abandona y regresa a la pantalla de cierre.
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
 * Contrato de un participante dentro de
 * `GET /proyectos/:projectId/sprints/:sprintId/resumen-cierre` (A8).
 *
 * Person-centric: cada persona aparece una única vez, sin importar cuántas
 * `ParticipacionProyecto` (roles) tenga en el proyecto — mismo invariante que
 * `TeamSummaryMemberDto` (projects/dto/team-summary-member.dto.ts). A8.1
 * preserva este invariante sin cambios: `participaciones` es un desglose
 * ADITIVO anidado dentro de la misma fila person-centric, nunca una fila por
 * rol a nivel de `participantes[]`.
 *
 * `tareasRealizadas` cuenta identidad de `Tarea` (idTarea distinto), nunca
 * tramos de `AsignacionTarea`: una misma tarea con varios tramos históricos
 * del mismo usuario cuenta una sola vez.
 *
 * `horasReportadas`/`horasCalculadas`/`horasAprobadas` son la suma, por
 * usuario, de las columnas homónimas de `HorasParticipacion` para ESTE
 * Sprint (`HorasParticipacion.idSprint = sprintId`) — A8 solo lee lo ya
 * persistido por A5/A7; nunca recalcula ni muta. Siguen siendo exactamente
 * `SUM(participaciones[].horas*)` (A8.1 no cambió esa semántica, solo agregó
 * el desglose que la sustenta) — un consumidor que solo lea estos tres
 * campos (p. ej. un cliente anterior a A8.1) sigue funcionando sin cambios.
 *
 * `participaciones`: desglose A8.1 — ver `SprintClosingSummaryParticipationDto`.
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
