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

/**
 * Orden canónico de prioridad usado en todo el repo
 * (misma tabla que `components/projects/task-board.utils.ts` y que
 * `compareTareas` del backend): ALTA antes que MEDIA antes que BAJA.
 */
const PRIORIDAD_ORDEN: Record<Prioridad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/** Orden de estado según las columnas fijas del tablero. */
const ESTADO_ORDEN: Record<EstadoTarea, number> = {
  POR_HACER: 0,
  EN_PROGRESO: 1,
  EN_REVISION: 2,
  HECHO: 3,
};

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
 * Devuelve las tareas de un hito dado. `hitoId === null` selecciona las
 * tareas sin hito (`idHito` ausente o `null`). `undefined` ⇒ copia
 * superficial sin filtrar. Mismo contrato que `filterTasksBySprint`.
 */
export function filterTasksByHito<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  hitoId: number | null | undefined,
): T[] {
  const lista = tasks ?? [];
  if (hitoId === undefined) return [...lista];
  if (hitoId === null) return lista.filter((tarea) => (tarea.idHito ?? null) === null);
  return lista.filter((tarea) => tarea.idHito === hitoId);
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

// --- Ordenamiento --------------------------------------------------------

export type CriterioOrdenTarea =
  | 'fechaLimite'
  | 'fechaCreacion'
  | 'prioridad'
  | 'estado'
  | 'titulo';

export type DireccionOrden = 'asc' | 'desc';

function compararCampoNoNulo<T extends TareaFiltrable>(
  a: T,
  b: T,
  criterio: 'prioridad' | 'estado' | 'titulo',
): number {
  switch (criterio) {
    case 'prioridad':
      return PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
    case 'estado':
      return ESTADO_ORDEN[a.estadoTarea] - ESTADO_ORDEN[b.estadoTarea];
    case 'titulo':
      return a.tituloTarea.localeCompare(b.tituloTarea, 'es', { sensitivity: 'base' });
  }
}

/**
 * Ordena por un único criterio. No muta la entrada.
 *
 * - `prioridad`: ALTA → MEDIA → BAJA en `asc`.
 * - `estado`: POR_HACER → EN_PROGRESO → EN_REVISION → HECHO en `asc`.
 * - `titulo`: alfabético español, sin distinguir mayúsculas ni acentos.
 * - `fechaLimite` / `fechaCreacion`: comparación directa de string ISO
 *   (YYYY-MM-DD…). Las tareas sin fecha (`null`/`undefined`/`''`) quedan
 *   SIEMPRE al final, tanto en `asc` como en `desc`.
 *
 * `direction` invierte el criterio principal, nunca el desempate: ante
 * valores repetidos el orden final es estable y determinista por `idTarea`
 * ascendente.
 */
export function sortTasks<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
  criteria: CriterioOrdenTarea,
  direction: DireccionOrden = 'asc',
): T[] {
  const lista = tasks ?? [];
  const factor = direction === 'desc' ? -1 : 1;

  if (criteria === 'fechaLimite' || criteria === 'fechaCreacion') {
    const valor = (tarea: T): string | null => {
      const bruto = criteria === 'fechaLimite' ? tarea.fechaLimite : tarea.fechaCreacion;
      return bruto == null || bruto === '' ? null : bruto;
    };
    const conFecha: T[] = [];
    const sinFecha: T[] = [];
    for (const tarea of lista) {
      (valor(tarea) === null ? sinFecha : conFecha).push(tarea);
    }
    conFecha.sort((a, b) => {
      const va = valor(a) as string;
      const vb = valor(b) as string;
      const dif = va < vb ? -1 : va > vb ? 1 : 0;
      return dif !== 0 ? dif * factor : a.idTarea - b.idTarea;
    });
    sinFecha.sort((a, b) => a.idTarea - b.idTarea);
    return [...conFecha, ...sinFecha];
  }

  return [...lista].sort((a, b) => {
    const dif = compararCampoNoNulo(a, b, criteria);
    return dif !== 0 ? dif * factor : a.idTarea - b.idTarea;
  });
}

// --- Paginación --------------------------------------------------------

export interface ResultadoPaginado<T> {
  /** Tareas de la página pedida; `[]` si la página está fuera de rango. */
  items: T[];
  /** Página solicitada, tal cual se recibió (no se normaliza). */
  pagina: number;
  /** Tamaño de página efectivo (mínimo 1). */
  tamanioPagina: number;
  /** Total de tareas de entrada. */
  totalItems: number;
  /** Nº de páginas completas/parciales; `0` si no hay tareas. */
  totalPaginas: number;
  /** `true` si `pagina` es un entero dentro de `[1, totalPaginas]`. */
  paginaEnRango: boolean;
  hayAnterior: boolean;
  haySiguiente: boolean;
}

/**
 * Pagina el arreglo con páginas indexadas desde 1. No muta la entrada.
 *
 * - `pageSize` se normaliza a un entero ≥ 1.
 * - Página fuera de rango (`< 1`, `> totalPaginas`, o no entera) ⇒
 *   `items: []` y `paginaEnRango: false`; NO se recorta a la última página,
 *   para poder distinguir "última página" de "fuera de rango".
 * - `pageSize` mayor que el total ⇒ la primera página trae todas las tareas.
 * - Entrada vacía/`undefined` ⇒ `items: []`, `totalPaginas: 0`.
 */
export function paginateTasks<T>(
  tasks: ListaTareas<T>,
  page: number,
  pageSize: number,
): ResultadoPaginado<T> {
  const lista = tasks ?? [];
  const totalItems = lista.length;
  const tamanioPagina = Math.max(1, Math.floor(pageSize) || 1);
  const totalPaginas = Math.ceil(totalItems / tamanioPagina);
  const paginaEnRango = Number.isInteger(page) && page >= 1 && page <= totalPaginas;

  const inicio = paginaEnRango ? (page - 1) * tamanioPagina : 0;
  const items = paginaEnRango ? lista.slice(inicio, inicio + tamanioPagina) : [];

  return {
    items,
    pagina: page,
    tamanioPagina,
    totalItems,
    totalPaginas,
    paginaEnRango,
    hayAnterior: paginaEnRango && page > 1,
    haySiguiente: paginaEnRango && page < totalPaginas,
  };
}

// --- Agrupación --------------------------------------------------------

export interface GrupoTareas<T> {
  /** Clave del grupo; `null` reúne las tareas sin proyecto/sprint. */
  clave: number | null;
  tareas: T[];
}

function agrupar<T>(
  tasks: ListaTareas<T>,
  clavear: (tarea: T) => number | null,
): GrupoTareas<T>[] {
  const grupos = new Map<number | null, T[]>();
  for (const tarea of tasks ?? []) {
    const clave = clavear(tarea);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(tarea);
    else grupos.set(clave, [tarea]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === null) return 1; // "sin proyecto/sprint" siempre al final
      if (b === null) return -1;
      return a - b;
    })
    .map(([clave, tareas]) => ({ clave, tareas }));
}

/**
 * Agrupa por `idProyecto`, ordenando los grupos por id ascendente y dejando
 * el grupo "sin proyecto" (`clave: null`) al final. Dentro de cada grupo se
 * preserva el orden de entrada. No muta la entrada.
 */
export function groupTasksByProject<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
): GrupoTareas<T>[] {
  return agrupar(tasks, (tarea) => tarea.idProyecto ?? null);
}

/**
 * Igual que `groupTasksByProject` pero por `idSprint`. Las tareas sin sprint
 * (campo ausente o `null`) caen en el grupo `clave: null`, al final.
 */
export function groupTasksBySprint<T extends TareaFiltrable>(
  tasks: ListaTareas<T>,
): GrupoTareas<T>[] {
  return agrupar(tasks, (tarea) => tarea.idSprint ?? null);
}
