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
