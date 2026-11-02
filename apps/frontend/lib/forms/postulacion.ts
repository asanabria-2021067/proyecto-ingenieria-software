/** Límites de la justificación de una postulación (los mismos que valida el backend). */
export const JUSTIFICACION_MIN = 40;
export const JUSTIFICACION_MAX = 1000;

/** Caracteres que faltan para llegar al mínimo; 0 si ya lo cumple. */
export function caracteresFaltantes(texto: string): number {
  return Math.max(0, JUSTIFICACION_MIN - texto.length);
}
