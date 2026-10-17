/**
 * HU-200 — formato de una mención dentro del contenido de un comentario.
 *
 *   @[Nombre Apellido](idUsuario)
 *
 * Es el mismo token que valida el backend
 * (apps/backend/src/comentarios/menciones/menciones.parser.ts). El usuario
 * nunca lo ve: en el cuadro de texto escribe y lee `@Nombre Apellido`, y el
 * token se arma al enviar a partir de las menciones elegidas en el
 * autocompletado. Al mostrar un comentario, el nombre sale de la relación
 * `menciones` que devuelve la API (nombre vigente), no de la etiqueta.
 */

const MENCION_TOKEN = /@\[([^[\]()\n]{1,120})\]\(([1-9]\d{0,8})\)/g;

/** Caracteres que romperían el token si aparecieran en la etiqueta. */
const CARACTERES_RESERVADOS = /[[\]()\n\r]/g;

export interface MencionSeleccionada {
  idUsuario: number;
  etiqueta: string;
}

export type SegmentoComentario =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'mencion'; idUsuario: number; etiqueta: string };

export function etiquetaMencion(nombre: string, apellido: string): string {
  return `${nombre} ${apellido}`.replace(CARACTERES_RESERVADOS, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Parte el contenido guardado en texto y menciones, en orden. */
export function segmentarComentario(contenido: string): SegmentoComentario[] {
  const segmentos: SegmentoComentario[] = [];
  let cursor = 0;
  for (const match of contenido.matchAll(MENCION_TOKEN)) {
    const inicio = match.index ?? 0;
    if (inicio > cursor) segmentos.push({ tipo: 'texto', texto: contenido.slice(cursor, inicio) });
    segmentos.push({ tipo: 'mencion', idUsuario: Number(match[2]), etiqueta: match[1].trim() });
    cursor = inicio + match[0].length;
  }
  if (cursor < contenido.length) segmentos.push({ tipo: 'texto', texto: contenido.slice(cursor) });
  return segmentos;
}

/** Contenido guardado → texto que se edita (`@Etiqueta`) + menciones activas. */
export function contenidoAEditable(contenido: string): { texto: string; menciones: MencionSeleccionada[] } {
  const menciones = new Map<number, MencionSeleccionada>();
  const texto = contenido.replace(MENCION_TOKEN, (_token, etiqueta: string, id: string) => {
    const idUsuario = Number(id);
    const limpia = etiqueta.trim();
    if (!menciones.has(idUsuario)) menciones.set(idUsuario, { idUsuario, etiqueta: limpia });
    return `@${limpia}`;
  });
  return { texto, menciones: [...menciones.values()] };
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Patrón de `@Etiqueta` como palabra completa: no puede seguir una letra o un
 * dígito (así `@Ana` no captura `@Anabel`).
 */
function patronEtiqueta(etiqueta: string): RegExp {
  return new RegExp(`@${escaparRegex(etiqueta)}(?![\\p{L}\\p{N}])`, 'gu');
}

/** Menciones cuyo `@Etiqueta` sigue presente en el texto. */
export function mencionesPresentes(texto: string, menciones: MencionSeleccionada[]): MencionSeleccionada[] {
  return menciones.filter((m) => patronEtiqueta(m.etiqueta).test(texto));
}

/**
 * Texto editable → contenido a guardar: cada `@Etiqueta` de una mención
 * elegida se convierte en su token. Se procesan primero las etiquetas más
 * largas para que «@Ana María» no quede a medias por culpa de «@Ana».
 */
export function editableAContenido(texto: string, menciones: MencionSeleccionada[]): string {
  const ordenadas = [...menciones].sort((a, b) => b.etiqueta.length - a.etiqueta.length);
  // Marcadores intermedios para que un token ya insertado no se vuelva a reemplazar.
  const tokens: string[] = [];
  let resultado = texto;
  for (const mencion of ordenadas) {
    resultado = resultado.replace(patronEtiqueta(mencion.etiqueta), () => {
      tokens.push(`@[${mencion.etiqueta}](${mencion.idUsuario})`);
      return `\u0000${tokens.length - 1}\u0000`;
    });
  }
  return resultado.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => tokens[Number(i)]);
}

/**
 * Consulta de autocompletado activa: el texto entre un `@` y el cursor. El
 * `@` debe iniciar palabra (no `correo@dominio`) y la consulta no cruza
 * saltos de línea. Admite espacios para buscar por nombre y apellido.
 */
export function consultaMencionActiva(
  texto: string,
  cursor: number,
): { inicio: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const arroba = antes.lastIndexOf('@');
  if (arroba === -1) return null;
  const previo = arroba === 0 ? '' : antes[arroba - 1];
  if (previo && !/[\s([{"'¿¡]/.test(previo)) return null;
  const consulta = antes.slice(arroba + 1);
  if (consulta.length > 40 || /[\n\r@]/.test(consulta) || /^\s/.test(consulta) || /\s{2,}/.test(consulta)) {
    return null;
  }
  return { inicio: arroba, consulta };
}

export function normalizarBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Coincide si cada palabra de la consulta es prefijo de alguna palabra del
 * nombre completo, sin distinguir tildes ni mayúsculas («mar lo» → María López).
 */
export function coincideMencionable(nombreCompleto: string, consulta: string): boolean {
  const palabrasConsulta = normalizarBusqueda(consulta).split(/\s+/).filter(Boolean);
  if (palabrasConsulta.length === 0) return true;
  const palabrasNombre = normalizarBusqueda(nombreCompleto).split(/\s+/);
  return palabrasConsulta.every((p) => palabrasNombre.some((n) => n.startsWith(p)));
}
