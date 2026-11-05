import { estaEnNoMolestar } from '../chat/chat-silencio.util';

/** MEJ-136: el horario de silencio se evalua siempre en hora de Guatemala. */
export const ZONA_SILENCIO = 'America/Guatemala';

const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export interface SilencioHorario {
  activo: boolean;
  horaInicio: string;
  horaFin: string;
}

/** Dentro de `inicio <= hora < fin`; si `fin <= inicio` el rango cruza la medianoche (22:00 a 07:00). */
export function enHorarioSilencio(pref: SilencioHorario | null | undefined, ahora: Date = new Date()): boolean {
  if (!pref) return false;
  return estaEnNoMolestar({ ...pref, diasSemana: TODOS_LOS_DIAS, zona: ZONA_SILENCIO }, ahora);
}

/** Quienes estan ahora dentro de su horario de silencio. Si falla la lectura, nadie (la notificacion igual se guarda). */
export async function usuariosEnSilencio(
  prisma: { preferenciaSilencioNotificacion: { findMany: (args: { where: object }) => Promise<(SilencioHorario & { idUsuario: number })[]> } },
  userIds: number[],
): Promise<Set<number>> {
  try {
    const filas = await prisma.preferenciaSilencioNotificacion.findMany({
      where: { idUsuario: { in: [...new Set(userIds)] }, activo: true },
    });
    return new Set(filas.filter((f) => enHorarioSilencio(f)).map((f) => f.idUsuario));
  } catch {
    return new Set();
  }
}
