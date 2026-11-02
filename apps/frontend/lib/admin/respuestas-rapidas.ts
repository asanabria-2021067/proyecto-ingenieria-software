/** MEJ-71: frases frecuentes del revisor; al elegir una se agrega al comentario sin borrar lo escrito. */
export const RESPUESTAS_RAPIDAS = [
  { etiqueta: 'Falta detalle', texto: 'Falta detalle en esta sección: describe con más precisión qué se hará y cómo.' },
  { etiqueta: 'Objetivos poco medibles', texto: 'Los objetivos no son medibles: indica un resultado concreto y cómo se comprobará.' },
  { etiqueta: 'Revisa fechas', texto: 'Revisa las fechas: el cronograma no es coherente con el alcance del proyecto.' },
  { etiqueta: 'Ajusta roles y cupos', texto: 'Ajusta los roles y cupos: deben corresponder con el trabajo descrito.' },
  { etiqueta: 'Mejora redacción', texto: 'Mejora la redacción para que cualquier estudiante entienda el proyecto.' },
] as const;

export function agregarRespuesta(actual: string, texto: string): string {
  const base = actual.trimEnd();
  if (base.includes(texto)) return actual;
  return base ? `${base}\n${texto}` : texto;
}
