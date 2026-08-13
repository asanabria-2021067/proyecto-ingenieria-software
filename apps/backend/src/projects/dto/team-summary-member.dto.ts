import { EstadoParticipacion } from '@prisma/client';

/**
 * Rol que un integrante ocupa dentro del proyecto.
 *
 * Un integrante puede tener múltiples roles simultáneamente (ver
 * {@link TeamSummaryMemberDto}), por lo que este tipo se expresa como
 * elemento de un arreglo y no como campo escalar.
 */
export interface TeamSummaryRoleDto {
  idRolProyecto: number;
  nombreRol: string;
}

/**
 * Contrato de un integrante dentro de `GET /proyectos/:id/miembros/resumen`.
 *
 * Regla A — Person-centric:
 * El endpoint es person-centric: cada persona aparece una única vez en
 * `miembros`, sin importar cuántos roles tenga dentro del proyecto. Los
 * roles de una misma persona se agrupan dentro de `roles`; una persona con
 * múltiples roles NO produce múltiples entradas de `TeamSummaryMemberDto`.
 *
 * Regla B — Participaciones activas:
 * Por defecto, la futura lista de `miembros` solo considera participaciones
 * con `estadoParticipacion = ACTIVO`.
 *
 * Regla C — Horas reconocidas:
 * `horasReconocidas` corresponde semánticamente a la suma de
 * `HorasParticipacion.horasAprobadas` únicamente para registros con
 * `HorasParticipacion.estadoHoras = APROBADA`. No debe confundirse ni
 * sustituirse por `AsignacionTarea.horasReales`, `Tarea.tiempoEstimadoHoras`
 * ni ningún otro cálculo de horas estimadas o reales.
 *
 * Regla E — Tareas:
 * `tareasActivas` y `tareasCompletadas` son campos contractuales cuya
 * consulta y regla de conteo se implementan en una tarea posterior.
 */
export interface TeamSummaryMemberDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  roles: TeamSummaryRoleDto[];
  estadoParticipacion: EstadoParticipacion;
  tareasActivas: number;
  tareasCompletadas: number;
  horasReconocidas: number;
}

/**
 * Contrato del líder dentro de `GET /proyectos/:id/miembros/resumen`.
 *
 * Regla D — Líder:
 * El líder proviene conceptualmente de `Proyecto.creadoPor` y se modela por
 * separado de `miembros`. No requiere una `ParticipacionProyecto` propia y,
 * por lo tanto, no debe recibir `idParticipacion`, `idRolProyecto`,
 * `estadoParticipacion`, horas ni contadores de tareas.
 */
export interface TeamSummaryLeaderDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}
