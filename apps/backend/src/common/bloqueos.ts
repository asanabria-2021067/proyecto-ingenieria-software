import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Pick<PrismaService, 'restriccionUsuario'>;

export const MENSAJE_BLOQUEO = 'No es posible interactuar con este usuario';

/** MEJ-153: hay un bloqueo en cualquiera de los dos sentidos entre a y b. */
export async function hayBloqueo(db: Db, a: number, b: number): Promise<boolean> {
  if (a === b) return false;
  const fila = await db.restriccionUsuario.findFirst({
    where: {
      tipo: 'BLOQUEO',
      OR: [
        { idUsuario: a, idObjetivo: b },
        { idUsuario: b, idObjetivo: a },
      ],
    },
    select: { idRestriccion: true },
  });
  return !!fila;
}

/** Mismo mensaje para quien bloquea y quien es bloqueado: no revela de que lado esta el bloqueo. */
export async function assertSinBloqueo(db: Db, a: number, b: number): Promise<void> {
  if (await hayBloqueo(db, a, b)) throw new ForbiddenException(MENSAJE_BLOQUEO);
}

/** Ids con los que `idUsuario` tiene un bloqueo en cualquier sentido. */
export async function idsBloqueados(db: Db, idUsuario: number): Promise<number[]> {
  const filas = await db.restriccionUsuario.findMany({
    where: { tipo: 'BLOQUEO', OR: [{ idUsuario }, { idObjetivo: idUsuario }] },
    select: { idUsuario: true, idObjetivo: true },
  });
  return [...new Set(filas.map((f) => (f.idUsuario === idUsuario ? f.idObjetivo : f.idUsuario)))];
}
