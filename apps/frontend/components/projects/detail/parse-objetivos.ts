/**
 * HU-154: los objetivos del proyecto se guardan como texto libre, uno por
 * línea, y muchos líderes los escriben como lista con viñetas. Devuelve los
 * objetivos sin viñeta (`-`, `*`, `•`), sin espacios sobrantes y sin líneas
 * vacías. Compartido por la vista del líder y la del participante.
 */
export function parseObjetivos(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .split('\n')
    .map((linea) => linea.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}
