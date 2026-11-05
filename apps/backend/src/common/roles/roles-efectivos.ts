import type { Prisma } from '@prisma/client';

export const ROL_LIDER_ASOCIACION = 'lider_asociacion';

/** Integrante de la junta de una asociación no archivada: eso da el perfil de líder de asociación. */
export const JUNTA_ACTIVA: Prisma.JuntaAsociacionWhereInput = { asociacion: { archivada: false } };

/** Select del usuario para saber si es integrante de alguna junta activa. */
export const SELECT_JUNTA_ACTIVA = { where: JUNTA_ACTIVA, select: { idJuntaAsociacion: true }, take: 1 } as const;

/**
 * Roles efectivos: los guardados en `usuario_rol_acceso` sin `lider_asociacion` (ya no se
 * asigna a mano; su fila queda sin efecto) más `lider_asociacion` si integra una junta activa.
 */
export function rolesEfectivos(guardados: string[], juntasActivas: unknown[]): string[] {
  const base = guardados.filter((r) => r !== ROL_LIDER_ASOCIACION);
  return juntasActivas.length > 0 ? [...base, ROL_LIDER_ASOCIACION] : base;
}
