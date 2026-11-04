/** Límites de la justificación de una postulación (los mismos que valida el backend). */
export const JUSTIFICACION_MIN = 40;
export const JUSTIFICACION_MAX = 1000;

/** Caracteres que faltan para llegar al mínimo; 0 si ya lo cumple. */
export function caracteresFaltantes(texto: string): number {
  return Math.max(0, JUSTIFICACION_MIN - texto.length);
}

/** Preguntas propias de cada rol (MEJ-97): los mismos límites que valida el backend. */
export const PREGUNTAS_MAX = 5;
export const ENUNCIADO_MAX = 200;
export const RESPUESTA_CORTA_MAX = 200;
export const RESPUESTA_LARGA_MAX = 2000;

export const respuestaMax = (tipo: 'CORTA' | 'LARGA') => (tipo === 'LARGA' ? RESPUESTA_LARGA_MAX : RESPUESTA_CORTA_MAX);

/** Errores por idPregunta: obligatoria sin texto o respuesta por encima del límite de su tipo. */
export function validarRespuestas(
  preguntas: { idPregunta: number; tipo: 'CORTA' | 'LARGA'; obligatoria: boolean }[],
  respuestas: Record<number, string>,
): Record<number, string> {
  const errores: Record<number, string> = {};
  for (const q of preguntas) {
    const texto = (respuestas[q.idPregunta] ?? '').trim();
    if (q.obligatoria && !texto) errores[q.idPregunta] = 'Esta pregunta es obligatoria.';
    else if (texto.length > respuestaMax(q.tipo)) errores[q.idPregunta] = `No puede superar ${respuestaMax(q.tipo)} caracteres.`;
  }
  return errores;
}
