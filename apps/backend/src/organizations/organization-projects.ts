import { BadRequestException } from '@nestjs/common';
import { EstadoMembresia, EstadoParticipacion, EstadoUsuario, Prisma } from '@prisma/client';
import { ROLES_PUBLICAN } from './organization-access';

export interface ParticipanteOrganizacion {
  idUsuario: number;
  /** Posición (desde 0) del rol dentro de `roles` del proyecto que se está creando. */
  indiceRol: number;
}

/** Quién puede participar en un proyecto de asociación: junta o estudiantes de sus carreras, usuarios activos. */
export const whereCandidatoAsociacion = (idAsociacion: number): Prisma.UsuarioWhereInput => ({
  estado: EstadoUsuario.ACTIVO,
  OR: [
    { juntasAsociacion: { some: { idAsociacion } } },
    { perfil: { is: { carrera: { asociaciones: { some: { idAsociacion } } } } } },
  ],
});

/**
 * Participantes elegidos entre los miembros de la organización: deben ser
 * miembros activos con rol Propietario, Administrador o Editor (Lectura solo
 * observa), distintos del líder, sin repetirse, y ocupan cupos del rol elegido
 * sin pasarse de ellos. En un proyecto de asociación, pueden ser integrantes
 * de su junta o estudiantes activos de las carreras que representa.
 */
export async function validarParticipantes(
  tx: Prisma.TransactionClient,
  idLider: number,
  idOrganizacion: number | undefined,
  participantes: ParticipanteOrganizacion[],
  roles: { cupos: number }[],
  idAsociacionDto?: number | null,
): Promise<void> {
  if (participantes.length === 0) return;
  const idAsociacion = idAsociacionDto ?? undefined; // el DTO acepta null
  if (idOrganizacion === undefined && idAsociacion === undefined) {
    throw new BadRequestException('Los participantes solo se eligen cuando el proyecto es de una organización o una asociación');
  }
  const ids = participantes.map((p) => p.idUsuario);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Un participante no puede repetirse');
  if (ids.includes(idLider)) throw new BadRequestException('El líder del proyecto no se agrega como participante');

  const ocupados = new Map<number, number>();
  for (const { indiceRol } of participantes) {
    if (!roles[indiceRol]) throw new BadRequestException('Cada participante debe tener un rol de proyecto existente');
    ocupados.set(indiceRol, (ocupados.get(indiceRol) ?? 0) + 1);
  }
  for (const [indiceRol, total] of ocupados) {
    if (total > roles[indiceRol].cupos) throw new BadRequestException('Hay más participantes que cupos en un rol');
  }

  if (idOrganizacion === undefined) {
    const validos = await tx.usuario.count({
      where: { idUsuario: { in: ids }, ...whereCandidatoAsociacion(idAsociacion as number) },
    });
    if (validos !== ids.length) {
      throw new BadRequestException('Solo pueden participar integrantes de la junta o estudiantes activos de las carreras de la asociación');
    }
    return;
  }
  const validos = await tx.usuarioOrganizacion.count({
    where: {
      idOrganizacion,
      idUsuario: { in: ids },
      estadoMembresia: EstadoMembresia.ACTIVA,
      rolOrganizacion: { in: [...ROLES_PUBLICAN] },
    },
  });
  if (validos !== ids.length) {
    throw new BadRequestException('Solo pueden participar miembros de la organización con rol Propietario, Administrador o Editor');
  }
}

/** Entran directo como participantes activos, sin postularse. `idsRoles` va en el mismo orden que `roles` al crear. */
export async function crearParticipaciones(
  tx: Prisma.TransactionClient,
  participantes: ParticipanteOrganizacion[],
  idsRoles: number[],
): Promise<void> {
  if (participantes.length === 0) return;
  await tx.participacionProyecto.createMany({
    data: participantes.map((p) => ({
      idUsuario: p.idUsuario,
      idRolProyecto: idsRoles[p.indiceRol],
      estadoParticipacion: EstadoParticipacion.ACTIVO,
    })),
  });
}
