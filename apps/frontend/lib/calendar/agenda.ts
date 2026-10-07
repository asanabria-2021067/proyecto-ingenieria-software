import type { MiTareaDTO } from '@/lib/services/users';
import type { MiEventoDTO, ModalidadEvento, TipoEvento } from '@/lib/services/events';
import type { TareaCompartidaDTO } from '@/lib/services/calendar-shares';
import type { TonoCalendario } from './paleta';
import { addDays, formatTime, parseFechaSolo, toDateKey } from './utils';

/** HU-184: el ítem viene del calendario que otra persona me compartió (solo lectura). */
export interface OrigenCompartido {
  idUsuario: number;
  nombre: string;
  tono: TonoCalendario;
}

/**
 * HU-169 (T-264): un ítem unificado de agenda para un día del calendario —
 * fecha límite de tarea o evento de proyecto. `sortKey` ordena eventos por
 * hora real y deja las tareas (sin hora) al final del día.
 */
export type AgendaItem =
  | {
      kind: 'tarea';
      key: string;
      sortKey: string;
      id: number;
      titulo: string;
      projectId: number;
      projectTitle: string;
      href: string;
      prioridad: MiTareaDTO['prioridad'];
      estado: MiTareaDTO['estadoTarea'];
      compartidoPor?: OrigenCompartido;
    }
  | {
      kind: 'evento';
      key: string;
      sortKey: string;
      id: number;
      projectId: number;
      titulo: string;
      descripcion: string | null;
      /** HU-184 (T-324): ícono y etiqueta de la modalidad. */
      modalidad: ModalidadEvento;
      /** HU-184: define el color del evento en las vistas. */
      tipo: TipoEvento;
      /** El evento abarca más de un día: va en la franja "todo el día", no en la cuadrícula de horas. */
      multiDia: boolean;
      compartidoPor?: OrigenCompartido;
      projectTitle: string;
      href: string;
      horaInicio: string;
      horaFin: string;
      fechaInicio: Date;
      fechaFin: Date;
    };

export function tareaToAgendaItem(tarea: MiTareaDTO & { fechaLimite: string }): AgendaItem {
  const fecha = parseFechaSolo(tarea.fechaLimite);
  return {
    kind: 'tarea',
    key: toDateKey(fecha),
    sortKey: '24:00', // "todo el día": después de cualquier evento con hora
    id: tarea.idTarea,
    titulo: tarea.tituloTarea,
    projectId: tarea.proyecto.idProyecto,
    projectTitle: tarea.proyecto.tituloProyecto,
    href: `/dashboard/projects/${tarea.proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`,
    prioridad: tarea.prioridad,
    estado: tarea.estadoTarea,
  };
}

/**
 * HU-184: fecha límite de una tarea de un calendario compartido. Sin href:
 * quien la ve no es necesariamente integrante del proyecto, así que la
 * tarea no es navegable.
 */
export function tareaCompartidaToAgendaItem(tarea: TareaCompartidaDTO, origen: OrigenCompartido): AgendaItem {
  const fecha = parseFechaSolo(tarea.fechaLimite);
  return {
    kind: 'tarea',
    key: toDateKey(fecha),
    sortKey: '24:00',
    id: tarea.idTarea,
    titulo: tarea.tituloTarea,
    projectId: tarea.proyecto.idProyecto,
    projectTitle: tarea.proyecto.tituloProyecto,
    href: '',
    prioridad: tarea.prioridad,
    estado: tarea.estadoTarea,
    compartidoPor: origen,
  };
}

export function eventoToAgendaItem(evento: MiEventoDTO, origen?: OrigenCompartido): AgendaItem {
  const fechaInicio = new Date(evento.fechaInicio);
  const fechaFin = new Date(evento.fechaFin);
  const horaInicio = formatTime(fechaInicio);
  return {
    kind: 'evento',
    key: toDateKey(fechaInicio),
    sortKey: horaInicio,
    id: evento.idEvento,
    projectId: evento.proyecto.idProyecto,
    titulo: evento.tituloEvento,
    descripcion: evento.descripcionEvento,
    modalidad: evento.modalidad,
    tipo: evento.tipoEvento,
    multiDia: toDateKey(fechaInicio) !== toDateKey(fechaFin),
    projectTitle: evento.proyecto.tituloProyecto,
    href: `/dashboard/projects/${evento.proyecto.idProyecto}`,
    horaInicio,
    horaFin: formatTime(fechaFin),
    fechaInicio,
    fechaFin,
    ...(origen && { compartidoPor: origen }),
  };
}

/**
 * Igual que eventoToAgendaItem, pero devuelve un AgendaItem por cada día
 * entre fechaInicio y fechaFin (recortado a [rangoDesde, rangoHasta)): nada
 * en el modelo restringe un evento a un solo día, y la consulta del backend
 * es por solapamiento, así que un evento que abarca varios días — o que
 * arranca antes del rango visible y lo solapa — debe aparecer en cada día
 * que toca, no solo en el de fechaInicio.
 */
export function eventoToAgendaItems(
  evento: MiEventoDTO,
  rangoDesde: Date,
  rangoHasta: Date,
  origen?: OrigenCompartido,
): AgendaItem[] {
  const base = eventoToAgendaItem(evento, origen);
  const fechaInicioEvento = new Date(evento.fechaInicio);
  const fechaFinEvento = new Date(evento.fechaFin);
  // rangoHasta es exclusivo (ver CalendarioPage): se resta un instante para
  // obtener el último día real que sigue dentro del rango visible.
  const finRangoInclusivo = new Date(rangoHasta.getTime() - 1);
  const primerDia = fechaInicioEvento < rangoDesde ? rangoDesde : fechaInicioEvento;
  const ultimoDia = fechaFinEvento < finRangoInclusivo ? fechaFinEvento : finRangoInclusivo;

  const items: AgendaItem[] = [];
  let cursor = new Date(primerDia.getFullYear(), primerDia.getMonth(), primerDia.getDate());
  const limite = new Date(ultimoDia.getFullYear(), ultimoDia.getMonth(), ultimoDia.getDate());
  while (cursor <= limite) {
    items.push({ ...base, key: toDateKey(cursor) });
    cursor = addDays(cursor, 1);
  }
  return items;
}

/** Clave estable para listas de React: el mismo evento puede venir de mi calendario y de uno compartido. */
export function agendaItemKey(item: AgendaItem): string {
  return `${item.kind}-${item.id}-${item.key}-${item.compartidoPor?.idUsuario ?? 'yo'}`;
}

/** Agrupa items por día (yyyy-mm-dd) y los ordena por sortKey dentro de cada grupo. */
export function groupAgendaItemsByDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const mapa = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const grupo = mapa.get(item.key);
    if (grupo) grupo.push(item);
    else mapa.set(item.key, [item]);
  }
  for (const grupo of mapa.values()) {
    grupo.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }
  return mapa;
}
