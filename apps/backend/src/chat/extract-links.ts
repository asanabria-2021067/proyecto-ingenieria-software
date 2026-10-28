// Se corta el texto antes de aplicar la regex: acota el costo en mensajes enormes.
const MAX_TEXTO = 20_000;
const MAX_ENLACES_POR_MENSAJE = 20;
// Sin cuantificadores anidados ni alternancias: tiempo lineal, sin ReDoS.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const PUNTUACION_FINAL = /[.,;:!?'"\]}]$/;

function contar(texto: string, caracter: string): number {
  return texto.split(caracter).length - 1;
}

function recortarFinal(candidato: string): string {
  let url = candidato;
  for (;;) {
    if (PUNTUACION_FINAL.test(url)) {
      url = url.slice(0, -1);
    } else if (url.endsWith(')') && contar(url, ')') > contar(url, '(')) {
      // ")" de cierre del texto que rodea al enlace, no parte de la URL.
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

/** Enlaces http/https de un texto, normalizados y sin duplicados, en orden de aparicion. */
export function extraerEnlaces(texto: string): string[] {
  const vistos = new Set<string>();
  for (const [candidato] of texto.slice(0, MAX_TEXTO).matchAll(URL_RE)) {
    let url: URL;
    try {
      url = new URL(recortarFinal(candidato));
    } catch {
      continue;
    }
    if (!url.hostname) continue;
    vistos.add(url.href);
    if (vistos.size >= MAX_ENLACES_POR_MENSAJE) break;
  }
  return [...vistos];
}
