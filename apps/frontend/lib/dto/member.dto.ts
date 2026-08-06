/**
 * Forma real de la respuesta del endpoint `GET /proyectos/:id/equipo`
 * (confirmada contra el `select` de Prisma en `findTeam`, no copiada del tipo
 * `Colaborador` de `equipo/page.tsx`, que está desactualizado — usa
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
 * Una participación concreta de un integrante en un rol del proyecto, tal
 * como se agrupará dentro de `MiembroProyectoResumenDTO.roles`.
 *
 * `idParticipacion` identifica esa participación puntual; un mismo usuario
 * puede tener varias (una por rol), por lo que NO debe usarse como
 * identidad del integrante.
 */
export interface RolMiembroProyectoDTO {
  idRolProyecto: number;
  idParticipacion: number;
  nombreRol: string;
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
}

/**
 * Contrato canónico person-centric de integrante: "miembro = usuario dentro
 * del proyecto", NO "una fila de `ParticipacionProyecto`".
 *
 * El integrante se identifica por `idUsuario`; sus participaciones/roles se
 * agrupan en `roles[]` en vez de repetir a la persona una vez por rol.
 *
 * Este tipo describe el contrato compartido futuro para T-106/HU-123/HU-124
 * (Sprint 6). Todavía NO hay endpoint que lo produzca — `useProjectMembers`
 * sigue devolviendo `MiembroProyecto` a partir de `ParticipacionActivaDTO`.
 * No usar este tipo para consumir `GET /proyectos/:id/equipo` hasta que T-106
 * exista.
 */
export interface MiembroProyectoResumenDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  roles: RolMiembroProyectoDTO[];
}

/**
 * El líder del proyecto proviene de `Proyecto.creadoPor` (ver
 * `apps/backend/prisma/schema.prisma`), no de una `ParticipacionProyecto`.
 * No tiene `idParticipacion`: no inventar uno sintético para representarlo
 * como si fuera un miembro más.
 */
export interface LiderProyectoDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}

/**
 * Contrato canónico futuro del resumen de equipo (T-106): separa
 * explícitamente al líder (`Proyecto.creadoPor`) del resto de integrantes
 * (`ParticipacionProyecto` agrupadas por usuario). Todavía NO existe un
 * endpoint que produzca esta forma.
 */
export interface ResumenEquipoProyectoDTO {
  lider: LiderProyectoDTO;
  miembros: MiembroProyectoResumenDTO[];
}
