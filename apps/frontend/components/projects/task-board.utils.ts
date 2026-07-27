import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
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

/**
 * Estilos de estado centralizados (Sección 32: "Centraliza estilos de estado";
 * no repetir estos valores en múltiples archivos). Cada entrada da el color del
 * indicador circular, el fondo y el texto del encabezado de columna con la
 * paleta pastel del workspace. Se incluyen variantes `dark:` translúcidas para
 * no romper el modo oscuro global (Sección 24: "No cambies modo oscuro").
 */
export interface EstadoColumnaStyle {
  headerBg: string;
  headerText: string;
  dot: string;
}

export const ESTADO_COLUMNA_STYLE: Record<EstadoTarea, EstadoColumnaStyle> = {
  POR_HACER: {
    headerBg: 'bg-[#E9EDF1] dark:bg-white/5',
    headerText: 'text-[#59616C] dark:text-slate-300',
    dot: 'bg-[#8A93A0]',
  },
  // En progreso = amarillo/ámbar y En revisión = azul, según la referencia
  // (Sección 29). Antes estaban invertidos; el color vive únicamente aquí.
  EN_PROGRESO: {
    headerBg: 'bg-[#FFF1CC] dark:bg-amber-500/10',
    headerText: 'text-[#8A6300] dark:text-amber-300',
    dot: 'bg-[#D9A400]',
  },
  EN_REVISION: {
    headerBg: 'bg-[#E6F0FF] dark:bg-blue-500/10',
    headerText: 'text-[#2B63B8] dark:text-blue-300',
    dot: 'bg-[#2B63B8]',
  },
  HECHO: {
    headerBg: 'bg-[#E2F1DD] dark:bg-green-500/10',
    headerText: 'text-[#286327] dark:text-green-300',
    dot: 'bg-[#3E9B3A]',
  },
};

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

/**
 * Icono + color de prioridad centralizados (Sección 39): la prioridad nunca
 * se comunica solo por color — siempre acompaña icono y texto. Reutilizados
 * por TaskCard y TaskDetailsSheet para no duplicar el mapa.
 */
export const PRIORIDAD_ICON: Record<Prioridad, typeof ArrowUp> = {
  ALTA: ArrowUp,
  MEDIA: Minus,
  BAJA: ArrowDown,
};

export const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  ALTA: 'text-red-600 dark:text-red-400',
  MEDIA: 'text-amber-600 dark:text-amber-400',
  BAJA: 'text-blue-500 dark:text-blue-400',
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

/**
 * Estado visual compartido de una barra de progreso (Sección 16): un único
 * contrato rojo → naranja → verde → verde UVG que se reutiliza en el
 * progreso de tareas y en el de hitos, en vez de repetir condiciones. No
 * guarda color en base de datos; solo deriva clases de Tailwind del %.
 */
export interface ProgressVisualState {
  /** Fondo de la barra rellenada. */
  bar: string;
  /** Color del texto del porcentaje/label asociado. */
  text: string;
  /** Fondo del carril (track) sin rellenar. */
  track: string;
  /** true solo al 100% — permite mostrar un indicador de completado. */
  complete: boolean;
}

export function getProgressVisualState(percent: number): ProgressVisualState {
  const p = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  if (p >= 100) {
    return {
      bar: 'bg-primary dark:bg-primary',
      text: 'text-[#1B5E20] dark:text-green-300',
      track: 'bg-[#E2F1DD] dark:bg-green-500/10',
      complete: true,
    };
  }
  if (p >= 67) {
    return {
      bar: 'bg-green-600 dark:bg-green-400',
      text: 'text-green-700 dark:text-green-300',
      track: 'bg-[#E2F1DD] dark:bg-green-500/10',
      complete: false,
    };
  }
  if (p >= 34) {
    return {
      bar: 'bg-orange-500 dark:bg-orange-400',
      text: 'text-orange-700 dark:text-orange-300',
      track: 'bg-[#FDE9D3] dark:bg-orange-500/10',
      complete: false,
    };
  }
  return {
    bar: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-700 dark:text-red-300',
    track: 'bg-[#FBE0E0] dark:bg-red-500/10',
    complete: false,
  };
}

/**
 * Progreso de tareas derivado de las tareas ya cargadas (Sección 14) — nunca
 * de `AvanceProyectoDTO`, que no expone el conteo de "En revisión". El
 * porcentaje es HECHO / total (0 cuando no hay tareas, sin dividir por cero).
 */
export interface TaskProgressResumen {
  total: number;
  porcentaje: number;
  conteos: Record<EstadoTarea, number>;
}

export function computeTaskProgress(tareas: TareaPublicaDTO[]): TaskProgressResumen {
  const conteos: Record<EstadoTarea, number> = {
    POR_HACER: 0,
    EN_PROGRESO: 0,
    EN_REVISION: 0,
    HECHO: 0,
  };
  for (const t of tareas) conteos[t.estadoTarea] += 1;
  const total = tareas.length;
  const porcentaje = total === 0 ? 0 : Math.round((conteos.HECHO / total) * 100);
  return { total, porcentaje, conteos };
}
