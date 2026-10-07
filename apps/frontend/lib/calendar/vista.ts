import type { TipoEvento } from '@/lib/services/events';
import type { AgendaItem } from './agenda';
import { tonoPorIndice, type TonoCalendario } from './paleta';
import {
  addDays,
  formatMonthLabel,
  formatWeekRangeLabel,
  getMonthMatrix,
  getWeekDays,
  toDateKey,
  type CalendarDay,
} from './utils';

/** HU-184 (T-324): vistas de la maqueta. */
export type VistaCalendario = 'dia' | 'semana' | 'mes';

export interface RangoVisible {
  /** Días que se dibujan (1 en Día, 7 en Semana, 42 en Mes). */
  days: CalendarDay[];
  desde: Date;
  /** Exclusivo. */
  hasta: Date;
}

function diaDe(fecha: Date): CalendarDay {
  const date = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return { date, key: toDateKey(date), inCurrentMonth: true };
}

/** Rango realmente visible: lo que se pide al backend, nunca "todos los eventos" (T-264). */
export function rangoVisible(vista: VistaCalendario, anchor: Date): RangoVisible {
  if (vista === 'dia') {
    const dia = diaDe(anchor);
    return { days: [dia], desde: dia.date, hasta: addDays(dia.date, 1) };
  }
  if (vista === 'semana') {
    const days = getWeekDays(anchor);
    return { days, desde: days[0].date, hasta: addDays(days[6].date, 1) };
  }
  const days = getMonthMatrix(anchor.getFullYear(), anchor.getMonth()).flat();
  return { days, desde: days[0].date, hasta: addDays(days[days.length - 1].date, 1) };
}

/** Anterior/siguiente según la vista: un día, una semana o un mes. */
export function navegar(vista: VistaCalendario, anchor: Date, paso: 1 | -1): Date {
  if (vista === 'dia') return addDays(anchor, paso);
  if (vista === 'semana') return addDays(anchor, 7 * paso);
  return new Date(anchor.getFullYear(), anchor.getMonth() + paso, 1);
}

export function etiquetaRango(vista: VistaCalendario, anchor: Date): string {
  if (vista === 'dia') {
    const texto = anchor.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
  if (vista === 'semana') {
    const days = getWeekDays(anchor);
    return formatWeekRangeLabel(days[0].date, days[6].date);
  }
  return formatMonthLabel(anchor.getFullYear(), anchor.getMonth());
}

export interface FiltrosCalendario {
  mostrarTareas: boolean;
  tiposOcultos: Set<TipoEvento>;
  /** Solo aplica a mi calendario: lo compartido se controla con su propio check. */
  proyectosOcultos: Set<number>;
}

export function filtrarItems(items: AgendaItem[], filtros: FiltrosCalendario): AgendaItem[] {
  return items.filter((item) => {
    if (item.kind === 'tarea' && !filtros.mostrarTareas) return false;
    if (item.kind === 'evento' && filtros.tiposOcultos.has(item.tipo)) return false;
    if (!item.compartidoPor && filtros.proyectosOcultos.has(item.projectId)) return false;
    return true;
  });
}

/** Cuántas cosas distintas hay (un evento de varios días cuenta una vez, aunque se dibuje en cada día). */
export function contarItems(items: AgendaItem[]): number {
  return new Set(items.map((i) => `${i.kind}-${i.id}-${i.compartidoPor?.idUsuario ?? 'yo'}`)).size;
}

export interface ProyectoConTono {
  idProyecto: number;
  tituloProyecto: string;
  tono: TonoCalendario;
}

/**
 * "Mis proyectos" de la columna izquierda: los que lidero más los que aparecen
 * en mi calendario (eventos o tareas), ordenados por nombre. El tono sale del
 * orden alfabético para que un proyecto no cambie de color al navegar.
 */
export function proyectosDelCalendario(
  propios: AgendaItem[],
  liderados: { idProyecto: number; tituloProyecto: string }[],
): ProyectoConTono[] {
  const porId = new Map<number, string>();
  for (const p of liderados) porId.set(p.idProyecto, p.tituloProyecto);
  for (const item of propios) if (!item.compartidoPor) porId.set(item.projectId, item.projectTitle);
  return [...porId.entries()]
    .map(([idProyecto, tituloProyecto]) => ({ idProyecto, tituloProyecto }))
    .sort((a, b) => a.tituloProyecto.localeCompare(b.tituloProyecto, 'es'))
    .map((p, i) => ({ ...p, tono: tonoPorIndice(i) }));
}
