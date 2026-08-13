/**
 * Forma real de la respuesta del endpoint `GET /proyectos/:id/equipo`
 * (confirmada contra el `select` de Prisma en `findTeam`, no copiada del
 * tipo `Colaborador` de `equipo/page.tsx`, que está desactualizado — usa
 * `idParticipacionProyecto`/`fechaInicio` en vez de los campos reales
 * `idParticipacion`/`fechaIngreso`, y espera `usuario.perfil`/`usuario.habilidades`,
 * que el backend no selecciona).
 */
export interface ParticipacionActivaDTO {
  idParticipacion: number;
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
  fechaIngreso: string;
  usuario: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    correo: string;
    fotoUrl: string | null;
  };
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
    descripcionRolProyecto: string | null;
  };
}

/** Forma aplanada consumida por la cascada rol → usuarios del formulario de tarea. */
export interface MiembroProyecto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  idRolProyecto: number;
}

/**
 * Rol que un integrante ocupa dentro del proyecto, tal como se agrupa dentro
 * de `MiembroProyectoResumenDTO.roles`. Espejo exacto de
 * `TeamSummaryRoleDto` (apps/backend/src/projects/dto/team-summary-member.dto.ts):
 * no lleva `idParticipacion` ni `estadoParticipacion` propios — esos viven a
 * nivel de integrante, no de rol individual.
 */
export interface RolMiembroProyectoDTO {
  idRolProyecto: number;
  nombreRol: string;
}

/**
 * Contrato canónico person-centric de integrante: "miembro = usuario dentro
 * del proyecto", NO "una fila de `ParticipacionProyecto`". Espejo exacto de
 * `TeamSummaryMemberDto`, la respuesta real de
 * `GET /proyectos/:id/miembros/resumen` (T-106).
 *
 * El integrante se identifica por `idUsuario`; sus roles se agrupan en
 * `roles[]` en vez de repetir a la persona una vez por rol.
 *
 * `horasReconocidas` es exclusivamente la suma de
 * `HorasParticipacion.horasAprobadas` con `estadoHoras = APROBADA` —  nunca
 * `AsignacionTarea.horasReales` ni `Tarea.tiempoEstimadoHoras`.
 */
export interface MiembroProyectoResumenDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  roles: RolMiembroProyectoDTO[];
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
  tareasActivas: number;
  tareasCompletadas: number;
  horasReconocidas: number;
}

/**
 * El líder del proyecto proviene de `Proyecto.creadoPor` (ver
 * `apps/backend/prisma/schema.prisma`), no de una `ParticipacionProyecto`.
 * No tiene `idParticipacion`, roles, ni métricas: no inventarle ninguno para
 * representarlo como si fuera un miembro más.
 */
export interface LiderProyectoDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}

/**
 * Contrato de respuesta de `GET /proyectos/:id/miembros/resumen` (T-106):
 * separa explícitamente al líder (`Proyecto.creadoPor`) del resto de
 * integrantes (`ParticipacionProyecto` agrupadas por usuario).
 */
export interface ResumenEquipoProyectoDTO {
  lider: LiderProyectoDTO;
  miembros: MiembroProyectoResumenDTO[];
}
