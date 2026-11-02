/** MEJ-45: enlaces internos (proyecto o tarea) dentro del texto de un mensaje. */

const MAX_TARJETAS = 3;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const RUTA_RE = /(?:^|\s)(\/dashboard\/(?:projects|proyectos)\/[1-9]\d{0,8}[^\s<>"'`]*)/g;
const INTERNA_RE = /^\/dashboard\/(?:projects|proyectos)\/[1-9]\d{0,8}(?:\/|$)/;

export interface EnlaceInternoMensaje {
  /** Pathname sin query ni hash: es lo que se envia al backend. */
  ruta: string;
  /** Pathname + query: destino del clic. */
  href: string;
}

function limpiarFinal(valor: string): string {
  return valor.replace(/[.,;:!?)\]}]+$/, '');
}

/** Hasta 3 enlaces internos sin repetir, en orden de aparicion; las URL de otro origen se ignoran. */
export function extraerEnlacesInternos(contenido: string, origen: string): EnlaceInternoMensaje[] {
  const vistos = new Map<string, EnlaceInternoMensaje>();
  const agregar = (path: string, search: string) => {
    if (!INTERNA_RE.test(path) || vistos.has(path) || vistos.size >= MAX_TARJETAS) return;
    vistos.set(path, { ruta: path, href: `${path}${search}` });
  };
  for (const [candidato] of contenido.matchAll(URL_RE)) {
    try {
      const url = new URL(limpiarFinal(candidato));
      if (url.origin === origen) agregar(url.pathname, url.search);
    } catch {
      // URL invalida: se trata como texto
    }
  }
  for (const [, ruta] of contenido.matchAll(RUTA_RE)) {
    try {
      const url = new URL(limpiarFinal(ruta), origen);
      agregar(url.pathname, url.search);
    } catch {
      // ruta invalida: se trata como texto
    }
  }
  return [...vistos.values()];
}

export function etiquetaEstado(estado: string): string {
  const texto = estado.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
