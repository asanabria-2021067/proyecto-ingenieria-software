import { EstadoUsuario, PoliticaEdicionReunion, type Prisma } from '@prisma/client';

/**
 * HU-195 (T-362): quién gestiona (edita, cambia proyectos o cancela) una
 * reunión de Administración. Leerlas es global para cualquier administrador;
 * gestionarlas depende de la política de la reunión, y en todos los casos de
 * ser administrador con cuenta ACTIVO al momento de la acción (nunca del rol
 * del proyecto ni de un dato del cliente).
 *
 * QC-01 (respaldo auditado, decidido por el usuario): si quien creó la reunión
 * deja de ser administrador activo, los editores seleccionados que sigan
 * autorizados conservan la gestión; si no queda ninguno, o la política es
 * SOLO_CREADOR, la gestiona cualquier administrador activo con motivo
 * RESPALDO_CREADOR_SIN_AUTORIZACION, que el servicio deja en la bitácora.
 */
export type MotivoGestion = 'POLITICA' | 'RESPALDO_CREADOR_SIN_AUTORIZACION';

export type Gestion = { puede: true; motivo: MotivoGestion } | { puede: false };

export interface ReunionParaGestion {
  idCreador: number;
  politicaEdicion: PoliticaEdicionReunion;
  editores: number[];
}

/** Administradores con cuenta ACTIVO entre `ids`, consultados con el `tx` del caller. */
export async function administradoresActivos(db: Prisma.TransactionClient, ids: number[]): Promise<Set<number>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Set();
  const filas = await db.usuarioRolAcceso.findMany({
    where: {
      idUsuario: { in: unicos },
      rolAcceso: { nombrePerfil: 'administrador' },
      usuario: { estado: EstadoUsuario.ACTIVO },
    },
    distinct: ['idUsuario'],
    select: { idUsuario: true },
  });
  return new Set(filas.map((fila) => fila.idUsuario));
}

/** Pura: `autorizados` = administradores activos entre actor, creador y editores. */
export function evaluarGestion(reunion: ReunionParaGestion, actorId: number, autorizados: Set<number>): Gestion {
  if (!autorizados.has(actorId)) return { puede: false };
  if (reunion.politicaEdicion === PoliticaEdicionReunion.TODOS_ADMINISTRADORES) return { puede: true, motivo: 'POLITICA' };

  const creadorVigente = autorizados.has(reunion.idCreador);
  if (actorId === reunion.idCreador) return { puede: true, motivo: 'POLITICA' };

  if (reunion.politicaEdicion === PoliticaEdicionReunion.ADMINISTRADORES_SELECCIONADOS) {
    if (reunion.editores.includes(actorId)) return { puede: true, motivo: 'POLITICA' };
    const quedaEditor = reunion.editores.some((id) => autorizados.has(id));
    if (!creadorVigente && !quedaEditor) return { puede: true, motivo: 'RESPALDO_CREADOR_SIN_AUTORIZACION' };
    return { puede: false };
  }

  // SOLO_CREADOR
  return creadorVigente ? { puede: false } : { puede: true, motivo: 'RESPALDO_CREADOR_SIN_AUTORIZACION' };
}

/** Cambiar política o editores: solo el creador mientras sea administrador activo (nadie amplía su propio acceso). */
export function puedeCambiarPolitica(reunion: Pick<ReunionParaGestion, 'idCreador'>, actorId: number, autorizados: Set<number>): boolean {
  return actorId === reunion.idCreador && autorizados.has(actorId);
}

export async function cargarGestion(
  db: Prisma.TransactionClient,
  reunion: ReunionParaGestion,
  actorId: number,
): Promise<{ gestion: Gestion; puedeCambiarPolitica: boolean }> {
  const autorizados = await administradoresActivos(db, [actorId, reunion.idCreador, ...reunion.editores]);
  return {
    gestion: evaluarGestion(reunion, actorId, autorizados),
    puedeCambiarPolitica: puedeCambiarPolitica(reunion, actorId, autorizados),
  };
}
