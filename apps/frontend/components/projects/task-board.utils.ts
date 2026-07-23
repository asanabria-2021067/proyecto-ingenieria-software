import type { EstadoTarea, Prioridad, TareaPublicaDTO } from '@/lib/types/tasks';

export interface ColumnaConfig {
  estado: EstadoTarea;
  titulo: string;
}

/**
 * Orden fijo de columnas — nunca se deriva dinámicamente de las tareas
 * presentes, para que las cuatro columnas existan aunque una de ellas esté
 * vacía.
 */
export const COLUMNAS_TABLERO: readonly ColumnaConfig[] = [
  { estado: 'POR_HACER', titulo: 'Por hacer' },
  { estado: 'EN_PROGRESO', titulo: 'En progreso' },
  { estado: 'EN_REVISION', titulo: 'En revisión' },
  { estado: 'HECHO', titulo: 'Hecho' },
] as const;

export const ESTADO_LABEL: Record<EstadoTarea, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

const PRIORIDAD_ORDEN: Record<Prioridad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Mismo criterio que `compareTareas` en
 * apps/backend/src/tasks/tasks.service.ts: prioridad ALTA > MEDIA > BAJA,
 * luego fechaLimite ascendente (string YYYY-MM-DD, comparación directa,
 * nulas al final) y por último idTarea ascendente como desempate estable.
 * No muta el array recibido.
 */
export function ordenarTareas(tareas: TareaPublicaDTO[]): TareaPublicaDTO[] {
  return [...tareas].sort((a, b) => {
    const prioridadDiff = PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
    if (prioridadDiff !== 0) return prioridadDiff;

    if (a.fechaLimite !== b.fechaLimite) {
      if (a.fechaLimite === null) return 1;
      if (b.fechaLimite === null) return -1;
      return a.fechaLimite < b.fechaLimite ? -1 : 1;
    }

    return a.idTarea - b.idTarea;
  });
}

/** YYYY-MM-DD del día calendario local — nunca UTC, para no desplazar el día. */
function hoyLocalISO(ahora: Date): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Vencida = fechaLimite anterior al día calendario actual (local) AND
 * estadoTarea !== 'HECHO'. Una tarea sin fecha nunca está vencida.
 */
export function estaVencida(tarea: TareaPublicaDTO, ahora: Date = new Date()): boolean {
  if (tarea.estadoTarea === 'HECHO' || tarea.fechaLimite === null) return false;
  return tarea.fechaLimite < hoyLocalISO(ahora);
}

/**
 * Formatea `fechaLimite` (YYYY-MM-DD) fijando `timeZone: 'UTC'` en el
 * formateador para el mismo instante UTC-medianoche con el que se
 * construyó: evita el desplazamiento de día documentado en el backend
 * (tasks.service.ts `toDateOnly`) cuando el navegador corre en una zona
 * horaria detrás de UTC (p. ej. Guatemala, UTC-6).
 */
export function formatearFechaLimite(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));
  return fechaUtc.toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const FILTRO_TODOS = 'todos';
export const FILTRO_SIN_ROL = 'sin-rol';
export const FILTRO_SIN_HITO = 'sin-hito';

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

/**
 * Opciones derivadas exclusivamente de las tareas ya cargadas (sin
 * consultar otro endpoint), deduplicadas por ID real y ordenadas de forma
 * determinista por nombre. "Sin rol" solo aparece si existe al menos una
 * tarea sin `rolProyecto`.
 */
export function derivarOpcionesRol(tareas: TareaPublicaDTO[]): OpcionFiltro[] {
  const mapa = new Map<number, string>();
  let haySinRol = false;
  for (const t of tareas) {
    if (t.rolProyecto) {
      mapa.set(t.rolProyecto.idRolProyecto, t.rolProyecto.nombreRol);
    } else {
      haySinRol = true;
    }
  }
  const opciones = [...mapa.entries()]
    .sort(([idA, nombreA], [idB, nombreB]) => nombreA.localeCompare(nombreB) || idA - idB)
    .map(([id, nombre]) => ({ valor: String(id), etiqueta: nombre }));
  if (haySinRol) opciones.push({ valor: FILTRO_SIN_ROL, etiqueta: 'Sin rol' });
  return opciones;
}

/**
 * Igual criterio que `derivarOpcionesRol`, sobre `tarea.hito`. A diferencia
 * de HitosSection (que cruza dos colecciones — hitos del proyecto y tareas
 * — y por eso puede toparse con un idHito huérfano), aquí `tarea.hito` ya
 * viene resuelto por el backend (objeto completo o null): no existe el caso
 * de una referencia sin objeto público cargado dentro de este contrato.
 */
export function derivarOpcionesHito(tareas: TareaPublicaDTO[]): OpcionFiltro[] {
  const mapa = new Map<number, string>();
  let haySinHito = false;
  for (const t of tareas) {
    if (t.hito) {
      mapa.set(t.hito.idHito, t.hito.tituloHito);
    } else {
      haySinHito = true;
    }
  }
  const opciones = [...mapa.entries()]
    .sort(([idA, nombreA], [idB, nombreB]) => nombreA.localeCompare(nombreB) || idA - idB)
    .map(([id, nombre]) => ({ valor: String(id), etiqueta: nombre }));
  if (haySinHito) opciones.push({ valor: FILTRO_SIN_HITO, etiqueta: 'Sin hito' });
  return opciones;
}

export function coincideFiltroRol(tarea: TareaPublicaDTO, filtro: string): boolean {
  if (filtro === FILTRO_TODOS) return true;
  if (filtro === FILTRO_SIN_ROL) return tarea.rolProyecto === null;
  return String(tarea.rolProyecto?.idRolProyecto ?? '') === filtro;
}

export function coincideFiltroHito(tarea: TareaPublicaDTO, filtro: string): boolean {
  if (filtro === FILTRO_TODOS) return true;
  if (filtro === FILTRO_SIN_HITO) return tarea.hito === null;
  return String(tarea.hito?.idHito ?? '') === filtro;
}

/** Combina ambos filtros con lógica AND. No muta `tareas`. */
export function filtrarTareas(
  tareas: TareaPublicaDTO[],
  filtroRol: string,
  filtroHito: string,
): TareaPublicaDTO[] {
  return tareas.filter((t) => coincideFiltroRol(t, filtroRol) && coincideFiltroHito(t, filtroHito));
}
