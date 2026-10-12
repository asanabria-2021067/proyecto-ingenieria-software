/**
 * Tonos de etiqueta de Comunidad (semestre y habilidades), sobre los tonos
 * `pill-*` del sistema (app/global.css), con su par claro/oscuro verificado.
 * El semestre lleva siempre el mismo turquesa: el número ya lo distingue. Las
 * habilidades reparten una paleta corta por hash estable, para que la misma
 * habilidad caiga en el mismo color en cualquier tarjeta o página.
 */
const SEMESTRE_TONE = 'pill-turquoise';

const HABILIDAD_PALETTE = ['pill-blue', 'pill-turquoise', 'pill-violet', 'pill-slate', 'pill-sage', 'pill-neutral'];

/** Hash estable (no criptográfico) para que la misma habilidad siempre caiga
 * en el mismo color, en cualquier tarjeta o página donde aparezca. */
function hashTexto(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getSemestreBadgeStyle(_semestre: number): string {
  return SEMESTRE_TONE;
}

export function getHabilidadBadgeStyle(habilidad: string): string {
  return HABILIDAD_PALETTE[hashTexto(habilidad) % HABILIDAD_PALETTE.length];
}
