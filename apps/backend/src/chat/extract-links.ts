// Se corta el texto antes de aplicar la regex: acota el costo en mensajes enormes.
const MAX_TEXTO = 20_000;
const MAX_ENLACES_POR_MENSAJE = 20;
// Sin cuantificadores anidados ni alternancias: tiempo lineal, sin ReDoS.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const PUNTUACION_FINAL = /[.,;:!?'"\]}]$/;

const MAX_URL = 2048;

function contar(texto: string, caracter: string): number {
  return texto.split(caracter).length - 1;
}

function recortarFinal(candidato: string): string {
  const abre = contar(candidato, '(');
  let cierra = contar(candidato, ')');
  let fin = candidato.length;
  while (fin > 0) {
    const ultimo = candidato[fin - 1];
    if (PUNTUACION_FINAL.test(ultimo)) {
      fin--;
    } else if (ultimo === ')' && cierra > abre) {
      // ")" de cierre del texto que rodea al enlace, no parte de la URL.
      fin--;
      cierra--;
    } else {
      break;
    }
  }
  return candidato.slice(0, fin);
}

/** Enlaces http/https de un texto, normalizados y sin duplicados, en orden de aparicion. */
export function extraerEnlaces(texto: string): string[] {
  const vistos = new Set<string>();
  for (const [candidato] of texto.slice(0, MAX_TEXTO).matchAll(URL_RE)) {
    if (candidato.length > MAX_URL) continue;
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
