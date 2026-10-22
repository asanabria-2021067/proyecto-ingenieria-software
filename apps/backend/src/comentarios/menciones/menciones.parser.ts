/**
 * HU-200 (T-376): formato de una mención dentro de `Comentario.contenido`.
 *
 *   @[Nombre Apellido](idUsuario)
 *
 * El id es la referencia estable (el frontend muestra el nombre vigente del
 * usuario, no el guardado); la etiqueta solo sirve de respaldo y para degradar
 * una mención inválida a texto normal (`@Nombre Apellido`) sin perder lo que
 * escribió el autor. Funciones puras: no consultan la base ni deciden quién es
 * elegible, eso lo resuelve `ComentariosService` con el proyecto del comentario.
 */

/** Etiqueta sin corchetes, paréntesis ni saltos de línea; id entero positivo. */
const MENCION_TOKEN = /@\[([^[\]()\n]{1,120})\]\(([1-9]\d{0,8})\)/g;

export interface MencionParseada {
  idUsuario: number;
  etiqueta: string;
}

/** Menciones del texto en orden de aparición, una por usuario (gana la primera etiqueta). */
export function extraerMenciones(contenido: string): MencionParseada[] {
  const vistas = new Map<number, MencionParseada>();
  for (const [, etiqueta, id] of contenido.matchAll(MENCION_TOKEN)) {
    const idUsuario = Number(id);
    if (!vistas.has(idUsuario)) {
      vistas.set(idUsuario, { idUsuario, etiqueta: etiqueta.trim() });
    }
  }
  return [...vistas.values()];
}

/**
 * Conserva el token de las menciones elegibles y convierte el resto en texto
 * normal (`@etiqueta`): una mención a quien no pertenece al proyecto se ignora,
 * no rechaza el comentario.
 */
export function normalizarMenciones(contenido: string, elegibles: ReadonlySet<number>): string {
  return contenido.replace(MENCION_TOKEN, (token, etiqueta: string, id: string) =>
    elegibles.has(Number(id)) ? token : `@${etiqueta.trim()}`,
  );
}
