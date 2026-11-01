import type { CargoJunta, NivelPermisoJunta } from '@prisma/client';

export const NIVEL_POR_CARGO: Record<CargoJunta, NivelPermisoJunta> = {
  PRESIDENTE: 'ADMINISTRADOR',
  VICEPRESIDENTE: 'EDITOR',
  SECRETARIO: 'EDITOR',
  TESORERO: 'EDITOR',
  VOCAL: 'LECTURA',
};

export const CARGO_ETIQUETA: Record<CargoJunta, string> = {
  PRESIDENTE: 'Presidente',
  VICEPRESIDENTE: 'Vicepresidente',
  SECRETARIO: 'Secretario',
  TESORERO: 'Tesorero',
  VOCAL: 'Vocal',
};

const ORDEN_NIVEL: Record<NivelPermisoJunta, number> = { LECTURA: 0, EDITOR: 1, ADMINISTRADOR: 2 };

export function nivelSuficiente(nivel: NivelPermisoJunta, minimo: NivelPermisoJunta): boolean {
  return ORDEN_NIVEL[nivel] >= ORDEN_NIVEL[minimo];
}

/** Publicar a nombre de la asociación: el Presidente siempre y quien tenga nivel Editor o superior. */
export function puedePublicarComoAsociacion(cargo: CargoJunta, nivel: NivelPermisoJunta): boolean {
  return cargo === 'PRESIDENTE' || nivelSuficiente(nivel, 'EDITOR');
}
