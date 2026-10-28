export interface TextoSegmento {
  texto: string;
  coincide: boolean;
}

// Un elemento por code point (sin acentos, minúscula) para que los índices del
// texto normalizado coincidan con los del original, igual que el backend
// (lower + unaccent).
function normalizar(texto: string): string[] {
  return Array.from(texto, (c) => c.normalize('NFD')[0].toLowerCase());
}

/** Parte `texto` en segmentos, marcando las apariciones de `termino` sin distinguir acentos ni mayúsculas. */
export function resaltarTexto(texto: string, termino: string | null | undefined): TextoSegmento[] {
  const aguja = termino ? normalizar(termino.trim()) : [];
  if (aguja.length === 0) return [{ texto, coincide: false }];

  const original = Array.from(texto);
  const puntos = normalizar(texto);
  const segmentos: TextoSegmento[] = [];
  let desde = 0;
  for (let i = 0; i + aguja.length <= puntos.length; i++) {
    if (!aguja.every((c, j) => puntos[i + j] === c)) continue;
    if (i > desde) segmentos.push({ texto: original.slice(desde, i).join(''), coincide: false });
    segmentos.push({ texto: original.slice(i, i + aguja.length).join(''), coincide: true });
    desde = i + aguja.length;
    i = desde - 1;
  }
  if (desde < original.length) segmentos.push({ texto: original.slice(desde).join(''), coincide: false });
  return segmentos;
}
