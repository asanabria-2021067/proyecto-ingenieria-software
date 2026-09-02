/**
 * Funciones puras de filtrado, búsqueda, ordenamiento, paginación y
 * agrupación de tareas. 100% frontend: sin React, sin `apiFetch`, sin acceso
 * a `Date.now()` implícito ni ningún efecto secundario. Ninguna función muta
 * el arreglo recibido — todas devuelven una colección nueva.
 *
 * Están tipadas de forma genérica sobre `TareaFiltrable`, la forma
 * estructural mínima que ya cumple `TareaPublicaDTO` (@/lib/types/tasks) y
 * también `MiTareaDTO` (@/lib/services/users). Cada función preserva el tipo
 * concreto `T` que recibe, así que encadenar
 * `searchTasks → filterTasksByStatus → sortTasks → paginateTasks` no pierde
 * campos ni obliga a castear.
 *
 * `idSprint` es opcional porque el contrato de tarea del backend todavía no
 * lo expone; `filterTasksBySprint` y `groupTasksBySprint` lo tratan como
 * "sin sprint" cuando está ausente o es `null`.
 */

import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';

/**
 * Subconjunto de campos que necesitan estas funciones. Cualquier DTO de
 * tarea del proyecto lo satisface estructuralmente; los campos opcionales
 * cubren a los DTO más angostos (p. ej. `MiTareaDTO` no trae `fechaCreacion`
 * ni `idProyecto` a nivel raíz).
 */
export interface TareaFiltrable {
  idTarea: number;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  fechaLimite: string | null;
  fechaCreacion?: string | null;
  idProyecto?: number | null;
  idHito?: number | null;
  /** Aún no expuesto por el backend; ausente/`null` ⇒ "sin sprint". */
  idSprint?: number | null;
}

/** Entrada tolerante: además del arreglo, se aceptan `null`/`undefined`. */
type ListaTareas<T> = readonly T[] | null | undefined;

/** Valor centinela para "no filtrar por este campo". */
export const FILTRO_TODOS = 'todos';

export type FiltroEstado = EstadoTarea | typeof FILTRO_TODOS;
export type FiltroPrioridad = Prioridad | typeof FILTRO_TODOS;

// --- Filtros ---------------------------------------------------------------

/**
 * Devuelve las tareas cuyo `estadoTarea` coincide con `status`.
 * `FILTRO_TODOS` (o `undefined`) devuelve una copia superficial sin filtrar,
 * para que la función siga siendo encadenable sin ramas especiales aguas
 * arriba.
 */
export function filterTasksByStatus<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  status: FiltroEstado | undefined,
): T[] {
  const lista = tasks ?? [];
  if (!status || status === FILTRO_TODOS) return [...lista];
  return lista.filter((tarea) => tarea.estadoTarea === status);
}

/**
 * Devuelve las tareas cuya `prioridad` coincide con `priority`.
 * `FILTRO_TODOS`/`undefined` ⇒ copia superficial sin filtrar.
 */
export function filterTasksByPriority<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  priority: FiltroPrioridad | undefined,
): T[] {
  const lista = tasks ?? [];
  if (!priority || priority === FILTRO_TODOS) return [...lista];
  return lista.filter((tarea) => tarea.prioridad === priority);
}

/**
 * Devuelve las tareas de un sprint dado. `sprintId === null` selecciona las
 * tareas sin sprint (`idSprint` ausente o `null`). `undefined` ⇒ copia
 * superficial sin filtrar.
 *
 * No está en la lista original de T-180, pero T-181 exige probar el filtro
 * combinado estado + prioridad + sprint; se incluye por simetría con los
 * otros dos filtros.
 */
export function filterTasksBySprint<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  sprintId: number | null | undefined,
): T[] {
  const lista = tasks ?? [];
  if (sprintId === undefined) return [...lista];
  if (sprintId === null) return lista.filter((tarea) => (tarea.idSprint ?? null) === null);
  return lista.filter((tarea) => tarea.idSprint === sprintId);
}

/**
 * Búsqueda por texto libre sobre `tituloTarea` y `descripcionTarea`.
 * Insensible a mayúsculas/minúsculas y por coincidencia parcial (substring).
 * Una consulta vacía o solo espacios devuelve una copia superficial sin
 * filtrar. Preserva el orden de entrada.
 */
export function searchTasks<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  query: string | null | undefined,
): T[] {
  const lista = tasks ?? [];
  const termino = (query ?? '').trim().toLowerCase();
  if (termino === '') return [...lista];
  return lista.filter((tarea) => {
    const titulo = tarea.tituloTarea.toLowerCase();
    const descripcion = (tarea.descripcionTarea ?? '').toLowerCase();
    return titulo.includes(termino) || descripcion.includes(termino);
  });
}
