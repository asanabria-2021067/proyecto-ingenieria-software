/**
 * HU-202/T-382: reglas puras de la selección múltiple de tareas (tablero y
 * lista), separadas del hook para probarlas sin React.
 */

/**
 * Ids entre `ancla` y `objetivo` (ambos incluidos) en el orden visible de un
 * grupo: una columna del Kanban o la página actual de la lista. Si alguno de
 * los dos no está en ese grupo (p. ej. la última marcada era de otra columna)
 * devuelve `null`: no hay rango, solo se alterna la tarjeta pulsada.
 */
export function rangoEntre(orden: readonly number[], ancla: number, objetivo: number): number[] | null {
  const desde = orden.indexOf(ancla);
  const hasta = orden.indexOf(objetivo);
  if (desde === -1 || hasta === -1) return null;
  const [inicio, fin] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  return orden.slice(inicio, fin + 1);
}

/** Selección sin los ids que ya no se ven (filtros, tarea eliminada); misma referencia si no cambia nada. */
export function podarSeleccion(seleccion: ReadonlySet<number>, visibles: readonly number[]): ReadonlySet<number> {
  const conjuntoVisibles = new Set(visibles);
  const podada = [...seleccion].filter((id) => conjuntoVisibles.has(id));
  return podada.length === seleccion.size ? seleccion : new Set(podada);
}

/** Texto de conteo reutilizado por la barra y los avisos: «1 tarea», «3 tareas». */
export function textoTareas(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'tarea' : 'tareas'}`;
}
