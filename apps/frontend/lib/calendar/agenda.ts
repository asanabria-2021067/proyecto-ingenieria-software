import type { MiTareaDTO } from '@/lib/services/users';
import type { MiEventoDTO, ModalidadEvento } from '@/lib/services/events';
import { addDays, formatTime, parseFechaSolo, toDateKey } from './utils';

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
      projectTitle: string;
      href: string;
      prioridad: MiTareaDTO['prioridad'];
      estado: MiTareaDTO['estadoTarea'];
    }
  | {
      kind: 'evento';
      key: string;
      sortKey: string;
      id: number;
      projectId: number;
      titulo: string;
      descripcion: string | null;
      /** HU-184 (T-324): define color e ícono del evento en las vistas. */
      modalidad: ModalidadEvento;
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
    projectTitle: tarea.proyecto.tituloProyecto,
    href: `/dashboard/projects/${tarea.proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`,
    prioridad: tarea.prioridad,
    estado: tarea.estadoTarea,
  };
}

export function eventoToAgendaItem(evento: MiEventoDTO): AgendaItem {
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
    projectTitle: evento.proyecto.tituloProyecto,
    href: `/dashboard/projects/${evento.proyecto.idProyecto}`,
    horaInicio,
    horaFin: formatTime(fechaFin),
    fechaInicio,
    fechaFin,
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
export function eventoToAgendaItems(evento: MiEventoDTO, rangoDesde: Date, rangoHasta: Date): AgendaItem[] {
  const base = eventoToAgendaItem(evento);
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
