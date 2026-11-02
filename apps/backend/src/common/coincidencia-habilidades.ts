import type { NivelHabilidad } from '@prisma/client';

/** MEJ-15/21/62: una sola definicion de «coincidencia» entre las habilidades de una persona y los requisitos de un rol. */

const PESO_NIVEL: Record<NivelHabilidad, number> = { BASICO: 1, INTERMEDIO: 2, AVANZADO: 3 };

/** A partir de este % el rol «coincide con tus habilidades» (chip de Explorar). */
export const UMBRAL_COINCIDE = 50;

export interface RequisitoCoincidencia {
  idHabilidad: number;
  nivelMinimo: NivelHabilidad;
  obligatorio?: boolean;
}

export interface Coincidencia {
  /** 0-100: requisitos cumplidos (la persona tiene la habilidad con nivel suficiente) sobre el total. */
  porcentaje: number;
  cumplidos: number;
  total: number;
  /** true si cumple todos los requisitos marcados como obligatorios. */
  cumpleObligatorios: boolean;
}

/** `null` si el rol no pide ninguna habilidad: no hay nada que comparar (no es 0 %). */
export function calcularCoincidencia(
  requisitos: RequisitoCoincidencia[],
  habilidades: ReadonlyMap<number, NivelHabilidad>,
): Coincidencia | null {
  if (requisitos.length === 0) return null;
  let cumplidos = 0;
  let cumpleObligatorios = true;
  for (const req of requisitos) {
    const nivel = habilidades.get(req.idHabilidad);
    const cumple = nivel !== undefined && PESO_NIVEL[nivel] >= PESO_NIVEL[req.nivelMinimo];
    if (cumple) cumplidos += 1;
    else if (req.obligatorio !== false) cumpleObligatorios = false;
  }
  return {
    porcentaje: Math.round((cumplidos / requisitos.length) * 100),
    cumplidos,
    total: requisitos.length,
    cumpleObligatorios,
  };
}

/** La mejor coincidencia entre varios roles (proyecto = su rol que mejor te queda). */
export function mejorCoincidencia(coincidencias: Array<Coincidencia | null>): Coincidencia | null {
  let mejor: Coincidencia | null = null;
  for (const c of coincidencias) {
    if (c && (!mejor || c.porcentaje > mejor.porcentaje)) mejor = c;
  }
  return mejor;
}
