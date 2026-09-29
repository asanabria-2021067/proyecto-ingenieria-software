/**
 * Paleta de colores del mockup de Stitch ("Comunidad UVG") para semestre y
 * habilidades: a propósito NO son los tokens del sistema de diseño (ese es
 * justo el pedido — colores variados por categoría, como en el mockup), con
 * variante `dark:` agregada porque el mockup es solo claro y esta app tiene
 * modo oscuro.
 */
const SEMESTRE_PALETTE = [
  'bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-400/20',
  'bg-teal-50 text-teal-700 border border-teal-200/60 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/20',
  'bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/20',
  'bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-400/20',
];

const HABILIDAD_PALETTE = [
  'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  'bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
  'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
];

/** Hash estable (no criptográfico) para que la misma habilidad siempre caiga
 * en el mismo color, en cualquier tarjeta o página donde aparezca. */
function hashTexto(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getSemestreBadgeStyle(semestre: number): string {
  return SEMESTRE_PALETTE[(semestre - 1) % SEMESTRE_PALETTE.length] ?? SEMESTRE_PALETTE[0];
}

export function getHabilidadBadgeStyle(habilidad: string): string {
  return HABILIDAD_PALETTE[hashTexto(habilidad) % HABILIDAD_PALETTE.length];
}
