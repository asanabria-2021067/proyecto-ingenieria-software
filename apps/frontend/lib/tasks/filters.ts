// Temporal mientras el PR #205 de Saúl (T-180) no mergea a develop.
// Mismo path y firmas que su archivo real: al mergear, se reemplaza este
// archivo completo y no hay que tocar nada más.

export interface TareaFiltrable {
  idTarea: number;
  idProyecto?: number;
  idSprint?: number | null;
  tituloTarea: string;
  descripcionTarea?: string | null;
  estadoTarea: string;
  prioridad: string;
  fechaLimite?: string | null;
  fechaCreacion?: string | null;
}

export type CampoOrden = 'fechaLimite' | 'fechaCreacion' | 'prioridad' | 'estado' | 'titulo';
export type DireccionOrden = 'asc' | 'desc';

export interface ResultadoPaginado<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GrupoTareas<T> {
  key: number | string;
  items: T[];
}

function safeList<T>(tareas: T[] | undefined | null): T[] {
  return tareas ?? [];
}

export function filterTasksByStatus<T extends { estadoTarea: string }>(
  tareas: T[] | undefined | null,
  estado?: string | null,
): T[] {
  const lista = safeList(tareas);
  if (!estado) return lista;
  return lista.filter((t) => t.estadoTarea === estado);
}

export function filterTasksByPriority<T extends { prioridad: string }>(
  tareas: T[] | undefined | null,
  prioridad?: string | null,
): T[] {
  const lista = safeList(tareas);
  if (!prioridad) return lista;
  return lista.filter((t) => t.prioridad === prioridad);
}

export function filterTasksBySprint<T extends { idSprint?: number | null }>(
  tareas: T[] | undefined | null,
  idSprint?: number | null,
): T[] {
  const lista = safeList(tareas);
  if (idSprint === undefined || idSprint === null) return lista;
  return lista.filter((t) => t.idSprint === idSprint);
}

export function searchTasks<T extends { tituloTarea: string; descripcionTarea?: string | null }>(
  tareas: T[] | undefined | null,
  texto?: string | null,
): T[] {
  const lista = safeList(tareas);
  const query = texto?.trim().toLowerCase();
  if (!query) return lista;
  return lista.filter((t) => {
    const titulo = t.tituloTarea?.toLowerCase() ?? '';
    const descripcion = t.descripcionTarea?.toLowerCase() ?? '';
    return titulo.includes(query) || descripcion.includes(query);
  });
}

const PRIORIDAD_ORDEN: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
const ESTADO_ORDEN: Record<string, number> = {
  POR_HACER: 0,
  EN_PROGRESO: 1,
  EN_REVISION: 2,
  HECHO: 3,
};

function compararNulosAlFinal(a: string | null | undefined, b: string | null | undefined): number | null {
  const aNulo = a === null || a === undefined;
  const bNulo = b === null || b === undefined;
  if (aNulo && bNulo) return 0;
  if (aNulo) return 1;
  if (bNulo) return -1;
  return null;
}

// Nulos siempre al final, sin importar la dirección. Desempate por idTarea.
export function sortTasks<T extends TareaFiltrable>(
  tareas: T[] | undefined | null,
  campo: CampoOrden,
  direccion: DireccionOrden = 'asc',
): T[] {
  const lista = [...safeList(tareas)];
  const signo = direccion === 'asc' ? 1 : -1;

  lista.sort((a, b) => {
    let cmp = 0;

    switch (campo) {
      case 'fechaLimite': {
        const nulos = compararNulosAlFinal(a.fechaLimite, b.fechaLimite);
        cmp = nulos !== null ? nulos : signo * (a.fechaLimite! < b.fechaLimite! ? -1 : a.fechaLimite! > b.fechaLimite! ? 1 : 0);
        break;
      }
      case 'fechaCreacion': {
        const nulos = compararNulosAlFinal(a.fechaCreacion, b.fechaCreacion);
        cmp = nulos !== null ? nulos : signo * (a.fechaCreacion! < b.fechaCreacion! ? -1 : a.fechaCreacion! > b.fechaCreacion! ? 1 : 0);
        break;
      }
      case 'prioridad': {
        const pa = PRIORIDAD_ORDEN[a.prioridad] ?? 99;
        const pb = PRIORIDAD_ORDEN[b.prioridad] ?? 99;
        cmp = signo * (pa - pb);
        break;
      }
      case 'estado': {
        const ea = ESTADO_ORDEN[a.estadoTarea] ?? 99;
        const eb = ESTADO_ORDEN[b.estadoTarea] ?? 99;
        cmp = signo * (ea - eb);
        break;
      }
      case 'titulo': {
        cmp = signo * a.tituloTarea.localeCompare(b.tituloTarea, 'es');
        break;
      }
    }

    if (cmp !== 0) return cmp;
    return a.idTarea - b.idTarea;
  });

  return lista;
}

// Página indexada desde 1; fuera de rango se recorta a la última válida.
export function paginateTasks<T>(
  tareas: T[] | undefined | null,
  page: number,
  pageSize: number,
): ResultadoPaginado<T> {
  const lista = safeList(tareas);
  const total = lista.length;
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : Math.max(total, 1);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const pageSolicitada = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePage = Math.min(pageSolicitada, totalPages);
  const start = (safePage - 1) * size;

  return {
    items: lista.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
  };
}

export function groupTasksByProject<T extends { idProyecto?: number }>(
  tareas: T[] | undefined | null,
): GrupoTareas<T>[] {
  const lista = safeList(tareas);
  const mapa = new Map<number, T[]>();
  for (const tarea of lista) {
    if (tarea.idProyecto === undefined) continue;
    const grupo = mapa.get(tarea.idProyecto);
    if (grupo) grupo.push(tarea);
    else mapa.set(tarea.idProyecto, [tarea]);
  }
  return Array.from(mapa.entries()).map(([key, items]) => ({ key, items }));
}

export function groupTasksBySprint<T extends { idSprint?: number | null }>(
  tareas: T[] | undefined | null,
): GrupoTareas<T>[] {
  const lista = safeList(tareas);
  const mapa = new Map<number | 'sin-sprint', T[]>();
  for (const tarea of lista) {
    const key = tarea.idSprint ?? 'sin-sprint';
    const grupo = mapa.get(key);
    if (grupo) grupo.push(tarea);
    else mapa.set(key, [tarea]);
  }
  return Array.from(mapa.entries()).map(([key, items]) => ({ key, items }));
}
