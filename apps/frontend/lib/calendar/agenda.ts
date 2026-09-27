import type { MiTareaDTO } from '@/lib/services/users';
import type { MiEventoDTO } from '@/lib/services/events';
import { formatTime, parseFechaSolo, toDateKey } from './utils';

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
    projectTitle: evento.proyecto.tituloProyecto,
    href: `/dashboard/projects/${evento.proyecto.idProyecto}`,
    horaInicio,
    horaFin: formatTime(fechaFin),
    fechaInicio,
    fechaFin,
  };
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
