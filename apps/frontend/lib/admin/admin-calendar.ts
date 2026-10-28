import { eventoToAgendaItems, type AgendaItem } from '@/lib/calendar/agenda';
import type { EventoItem } from '@/lib/calendar/time-grid';
import { formatTime, toDateKey } from '@/lib/calendar/utils';
import type { MiEventoDTO } from '@/lib/services/events';
import type { AdminMeeting, AdminMeetingContenido } from '@/lib/types/admin-meetings';
import type { AdminSprintCalendarItem } from '@/lib/types/admin-sprints';
import { adminProjectHref, formatDiaConAnio, sinTildes } from './sprint-calendar';

/**
 * Calendario administrativo: une las finalizaciones planificadas de Sprints y
 * las reuniones de Administración en un modelo de presentación discriminado
 * por origen. No hay reglas nuevas: la situación del Sprint la da el backend
 * y el reparto de una reunión por días es el mismo del calendario del
 * estudiante (`eventoToAgendaItems`). Cada entrada conserva su dato original
 * (`sprint` o `reunion`) para el panel de detalle y un `AgendaItem` para las
 * vistas compartidas (`TimeGridView`).
 */

export type ReunionVisible = AdminMeeting & { contenido: AdminMeetingContenido };

export type EntradaAdmin =
  | { origen: 'SPRINT_FINALIZACION'; dia: string; sprint: AdminSprintCalendarItem; agenda: AgendaItem }
  | { origen: 'REUNION_ADMINISTRATIVA'; dia: string; reunion: ReunionVisible; agenda: EventoItem };

/** Clave estable de una entrada en un día (una reunión de varios días tiene una por día). */
export function entradaKey(entrada: EntradaAdmin): string {
  return `${entrada.origen}-${idDeEntrada(entrada)}-${entrada.dia}`;
}

export function idDeEntrada(entrada: EntradaAdmin): number {
  return entrada.origen === 'SPRINT_FINALIZACION' ? entrada.sprint.idSprint : entrada.reunion.idReunion;
}

/**
 * Una reunión se pinta solo si no está cancelada y su contenido es canónico.
 * Con proyecciones divergentes el backend no elige una (`contenido: null`):
 * se cuenta aparte para avisarlo, nunca se inventa un horario.
 */
export function separarReunionesVisibles(reuniones: readonly AdminMeeting[]): {
  visibles: ReunionVisible[];
  inconsistentes: number;
} {
  const visibles: ReunionVisible[] = [];
  let inconsistentes = 0;
  for (const reunion of reuniones) {
    if (reunion.estado === 'CANCELADA') continue;
    if (reunion.contenido === null) inconsistentes += 1;
    else visibles.push(reunion as ReunionVisible);
  }
  return { visibles, inconsistentes };
}

/** Búsqueda parcial por título de la reunión o por cualquiera de sus proyectos, sin mayúsculas ni tildes. */
export function searchReuniones<T extends AdminMeeting>(reuniones: readonly T[], query: string): T[] {
  const termino = sinTildes(query.trim());
  if (termino === '') return [...reuniones];
  return reuniones.filter(
    (reunion) =>
      (reunion.contenido !== null && sinTildes(reunion.contenido.tituloEvento).includes(termino)) ||
      reunion.proyectos.some((p) => sinTildes(p.tituloProyecto).includes(termino)),
  );
}

/** «Huerto Comunitario» con un proyecto; «3 proyectos» con varios. */
export function etiquetaProyectosReunion(reunion: AdminMeeting): string {
  if (reunion.proyectos.length === 1) return reunion.proyectos[0].tituloProyecto;
  return `${reunion.proyectos.length} proyectos`;
}

/**
 * Finalización de un Sprint como ítem de "Todo el día". Nunca recibe hora:
 * el plan es un día calendario. La admin la dibuja con su propia ficha
 * (`renderTodoElDia`); prioridad y estado solo completan el tipo compartido.
 */
export function sprintToAgendaItem(sprint: AdminSprintCalendarItem & { fechaFinPlaneada: string }): AgendaItem {
  return {
    kind: 'tarea',
    key: sprint.fechaFinPlaneada,
    sortKey: '24:00',
    id: sprint.idSprint,
    titulo: `${sprint.tituloProyecto} · Sprint ${sprint.numero}`,
    projectId: sprint.idProyecto,
    projectTitle: sprint.tituloProyecto,
    href: adminProjectHref(sprint.idProyecto),
    prioridad: 'MEDIA',
    estado: 'POR_HACER',
  };
}

/**
 * Tramos por día de una reunión dentro de [desde, hasta), con el mismo
 * reparto que un evento del estudiante (cruce de medianoche, varios días).
 * El adaptador solo traduce campos: `idEvento` lleva el id de la REUNIÓN y la
 * reunión no es navegable (`href` vacío), porque aún no tiene pantalla propia.
 */
export function reunionToAgendaItems(reunion: ReunionVisible, desde: Date, hasta: Date): EventoItem[] {
  const { contenido } = reunion;
  const primero = reunion.proyectos[0];
  const evento: MiEventoDTO = {
    idEvento: reunion.idReunion,
    idProyecto: primero?.idProyecto ?? 0,
    tituloEvento: contenido.tituloEvento,
    descripcionEvento: contenido.descripcionEvento,
    fechaInicio: contenido.fechaInicio,
    fechaFin: contenido.fechaFin,
    antelacionMinutos: 0,
    modalidad: contenido.modalidad,
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: contenido.ubicacionNombre,
    linkSesion: null,
    rolesDestino: [],
    tipoEvento: 'REUNION',
    invitados: [],
    proyecto: { idProyecto: primero?.idProyecto ?? 0, tituloProyecto: etiquetaProyectosReunion(reunion) },
  };
  return eventoToAgendaItems(evento, desde, hasta).map((item) => ({ ...(item as EventoItem), href: '' }));
}

/**
 * Entradas por día (`YYYY-MM-DD`): primero las finalizaciones (ya en orden
 * de supervisión), luego las reuniones por hora de inicio.
 */
export function agruparEntradasPorDia(
  sprintsPorDia: ReadonlyMap<string, AdminSprintCalendarItem[]>,
  reuniones: readonly ReunionVisible[],
  desde: Date,
  hasta: Date,
): Map<string, EntradaAdmin[]> {
  const porDia = new Map<string, EntradaAdmin[]>();
  const agregar = (entrada: EntradaAdmin) => {
    const delDia = porDia.get(entrada.dia);
    if (delDia) delDia.push(entrada);
    else porDia.set(entrada.dia, [entrada]);
  };
  for (const [dia, sprints] of sprintsPorDia) {
    for (const sprint of sprints) {
      agregar({ origen: 'SPRINT_FINALIZACION', dia, sprint, agenda: sprintToAgendaItem({ ...sprint, fechaFinPlaneada: dia }) });
    }
  }
  const tramos = reuniones
    .flatMap((reunion) => reunionToAgendaItems(reunion, desde, hasta).map((agenda) => ({ reunion, agenda })))
    .sort((a, b) => a.agenda.sortKey.localeCompare(b.agenda.sortKey));
  for (const { reunion, agenda } of tramos) agregar({ origen: 'REUNION_ADMINISTRATIVA', dia: agenda.key, reunion, agenda });
  return porDia;
}

/** Cuántas reuniones DISTINTAS tocan alguno de los días dados (una de varios días cuenta una vez). */
export function contarReunionesEnDias(porDia: ReadonlyMap<string, EntradaAdmin[]>, dias: Iterable<string>): number {
  const ids = new Set<number>();
  for (const dia of dias) {
    for (const entrada of porDia.get(dia) ?? []) if (entrada.origen === 'REUNION_ADMINISTRATIVA') ids.add(entrada.reunion.idReunion);
  }
  return ids.size;
}

/** «1 reunión administrativa» / «2 reuniones administrativas». */
export function contarReuniones(cantidad: number): string {
  return cantidad === 1 ? '1 reunión administrativa' : `${cantidad} reuniones administrativas`;
}

/** «09:00 – 10:30» y, si termina otro día, «09:00 – 01:00 (termina el 9 oct 2026)». Horario del navegador, como el calendario del estudiante. */
export function describirHorarioReunion(contenido: AdminMeetingContenido): string {
  const inicio = new Date(contenido.fechaInicio);
  const fin = new Date(contenido.fechaFin);
  const horario = `${formatTime(inicio)} – ${formatTime(fin)}`;
  const diaFin = toDateKey(fin);
  return diaFin === toDateKey(inicio) ? horario : `${horario} (termina el ${formatDiaConAnio(diaFin)})`;
}

/** Día de inicio `YYYY-MM-DD` de la reunión en el huso del navegador. */
export function diaInicioReunion(contenido: AdminMeetingContenido): string {
  return toDateKey(new Date(contenido.fechaInicio));
}
