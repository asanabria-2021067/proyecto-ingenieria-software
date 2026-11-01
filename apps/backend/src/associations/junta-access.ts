import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { puedePublicarComoAsociacion } from './associations.rules';

export const JUNTA_FORBIDDEN_MESSAGE = 'No perteneces a la junta de esta asociación';
export const JUNTA_PUBLICAR_FORBIDDEN_MESSAGE = 'Solo el Presidente y los Editores de la junta publican a nombre de la asociación';
export const ASOCIACION_ARCHIVADA_MESSAGE = 'La asociación está archivada';

type Db = Pick<PrismaClient | Prisma.TransactionClient, 'juntaAsociacion'>;

/** Membresía del usuario en la junta de la asociación, o null si no es de ella. */
export function membresiaJunta(db: Db, idAsociacion: number, idUsuario: number) {
  return db.juntaAsociacion.findUnique({
    where: { idAsociacion_idUsuario: { idAsociacion, idUsuario } },
    include: { asociacion: { select: { idAsociacion: true, nombre: true, archivada: true } } },
  });
}

/** Publicar a nombre de la asociación: Presidente y Editores (o más) de una asociación no archivada. */
export async function assertPuedePublicarComoAsociacion(db: Db, idAsociacion: number, idUsuario: number): Promise<void> {
  const m = await membresiaJunta(db, idAsociacion, idUsuario);
  if (!m || !puedePublicarComoAsociacion(m.cargo, m.nivelPermiso)) {
    throw new ForbiddenException(JUNTA_PUBLICAR_FORBIDDEN_MESSAGE);
  }
  if (m.asociacion.archivada) throw new ForbiddenException(ASOCIACION_ARCHIVADA_MESSAGE);
}
