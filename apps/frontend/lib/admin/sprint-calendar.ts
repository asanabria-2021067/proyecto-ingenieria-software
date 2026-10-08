import { parseFechaSolo, toDateKey } from '@/lib/calendar/utils';
import type { AdminSprintCalendarItem, AdminSprintSituacion } from '@/lib/types/admin-sprints';

/**
 * Presentación del calendario administrativo de Sprints.
 *
 * Aquí no hay reglas temporales: qué Sprint está vencido, vence hoy o sigue
 * en curso lo decide el backend (`situacion`, `diasRestantes`). Estas
 * funciones solo agrupan, eligen qué mostrar y dan formato.
 */

export const SITUACION_SPRINT_LABEL: Record<AdminSprintSituacion, string> = {
  EN_CURSO: 'En curso',
  VENCE_HOY: 'Vence hoy',
  PLAN_VENCIDO: 'Plan vencido',
  EN_FINALIZACION: 'En finalización',
  SIN_FECHA: 'Sin fecha planificada',
};

/**
 * Tono de la píldora por situación, con los roles de color del sistema de
 * diseño. El plan vencido usa el naranja de atención, no el rojo: el rojo se
 * reserva para bloqueos.
 */
export const SITUACION_SPRINT_TONE: Record<AdminSprintSituacion, string> = {
  EN_CURSO: 'pill-success',
  VENCE_HOY: 'pill-accent',
  PLAN_VENCIDO: 'bg-attention/15 text-attention-strong dark:text-attention',
  EN_FINALIZACION: 'pill-neutral',
  SIN_FECHA: 'pill-neutral',
};

/**
 * Cuántos Sprints tienen su finalización esperada en cada día (`YYYY-MM-DD`).
 * Un Sprint sin fecha planificada no marca ningún día.
 */
export function countSprintsByPlannedDay(items: readonly AdminSprintCalendarItem[]): Map<string, number> {
  const porDia = new Map<string, number>();
  for (const item of items) {
    if (item.fechaFinPlaneada === null) continue;
    porDia.set(item.fechaFinPlaneada, (porDia.get(item.fechaFinPlaneada) ?? 0) + 1);
  }
  return porDia;
}

/**
 * El Sprint activo cuyo plan está más cerca sin haber vencido: primero el que
 * vence hoy, luego el siguiente en curso. Un Sprint en finalización no
 * cuenta —su trabajo ya terminó— y tampoco uno sin fecha o ya vencido.
 */
export function pickNextSprintFinalization(
  items: readonly AdminSprintCalendarItem[],
): AdminSprintCalendarItem | null {
  let proximo: AdminSprintCalendarItem | null = null;
  for (const item of items) {
    if (item.estado !== 'ACTIVO' || item.diasRestantes === null || item.diasRestantes < 0) continue;
    if (proximo === null || item.diasRestantes < (proximo.diasRestantes as number)) {
      proximo = item;
    }
  }
  return proximo;
}

/** «hoy», «mañana» o «en N días» a partir de los días restantes que da el backend. */
export function formatDiasRestantes(diasRestantes: number): string {
  if (diasRestantes === 0) return 'hoy';
  if (diasRestantes === 1) return 'mañana';
  if (diasRestantes > 1) return `en ${diasRestantes} días`;
  return diasRestantes === -1 ? 'hace 1 día' : `hace ${Math.abs(diasRestantes)} días`;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * «5 oct» para un día `YYYY-MM-DD`. Se arma con los dígitos del día (vía
 * `parseFechaSolo`), nunca con `new Date('YYYY-MM-DD')`, que lo leería como
 * UTC y lo correría un día hacia atrás en Guatemala.
 */
export function formatDiaCorto(dia: string): string {
  const fecha = parseFechaSolo(dia);
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]}`;
}

/** «8 de octubre» para un día `YYYY-MM-DD`. */
export function formatDiaLargo(dia: string): string {
  const fecha = parseFechaSolo(dia);
  return `${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

/** Nombre accesible de un día: «8 de octubre, 3 finalizaciones planificadas» o «…, sin finalizaciones planificadas». */
export function describePlannedDay(dia: string, cantidad: number): string {
  const sufijo =
    cantidad === 0
      ? 'sin finalizaciones planificadas'
      : cantidad === 1
        ? '1 finalización planificada'
        : `${cantidad} finalizaciones planificadas`;
  return `${formatDiaLargo(dia)}, ${sufijo}`;
}

// ─── Vista completa (/dashboard/admin/sprints) ───────────────────────────────

/**
 * Día `YYYY-MM-DD` del parámetro `?fecha=`, o `null` si falta o no es un día
 * real del calendario (`2026-02-30`, `hoy`, `2026-1-5`…). Quien lo usa cae en
 * el «hoy» del servidor: un enlace roto nunca rompe la página.
 */
export function parseFechaParam(valor: string | null | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return toDateKey(parseFechaSolo(valor)) === valor ? valor : null;
}

/** Enlace al calendario de Sprints en una vista y, si se indica, con un día seleccionado. */
export function adminSprintsHref(vista: 'mes' | 'lista', fecha?: string | null): string {
  return `/dashboard/admin/sprints?vista=${vista}${fecha ? `&fecha=${fecha}` : ''}`;
}

/** Etiqueta corta de la situación para filtros, tabla y detalle del día. */
export const SITUACION_SPRINT_LABEL_CORTA: Record<AdminSprintSituacion, string> = {
  ...SITUACION_SPRINT_LABEL,
  SIN_FECHA: 'Sin fecha',
};

/**
 * Prioridad de supervisión de la vista Lista: primero lo que ya pasó su plan,
 * luego lo que vence hoy, lo que sigue en curso, lo que ya está cerrando y, al
 * final, lo que no tiene fecha. Solo ORDENA la situación que dio el backend.
 */
export const ORDEN_SITUACION_SPRINT: readonly AdminSprintSituacion[] = [
  'PLAN_VENCIDO',
  'VENCE_HOY',
  'EN_CURSO',
  'EN_FINALIZACION',
  'SIN_FECHA',
];

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Búsqueda parcial por proyecto o líder, sin distinguir mayúsculas ni tildes. */
export function searchSprints(
  items: readonly AdminSprintCalendarItem[],
  query: string,
): AdminSprintCalendarItem[] {
  const termino = sinTildes(query.trim());
  if (termino === '') return [...items];
  return items.filter(
    (item) =>
      sinTildes(item.tituloProyecto).includes(termino) ||
      sinTildes(`${item.lider.nombre} ${item.lider.apellido}`).includes(termino),
  );
}

/** Filtra por la situación recibida; `null` deja pasar todo. */
export function filterSprintsBySituacion(
  items: readonly AdminSprintCalendarItem[],
  situacion: AdminSprintSituacion | null,
): AdminSprintCalendarItem[] {
  return situacion === null ? [...items] : items.filter((item) => item.situacion === situacion);
}

/**
 * Orden de la vista Lista: prioridad de situación, luego la finalización
 * esperada más próxima (sin fecha al final) y el id del Sprint como desempate
 * estable. Los días `YYYY-MM-DD` se comparan como texto.
 */
export function sortSprintsForSupervision(items: readonly AdminSprintCalendarItem[]): AdminSprintCalendarItem[] {
  return [...items].sort((a, b) => {
    const porSituacion = ORDEN_SITUACION_SPRINT.indexOf(a.situacion) - ORDEN_SITUACION_SPRINT.indexOf(b.situacion);
    if (porSituacion !== 0) return porSituacion;
    if (a.fechaFinPlaneada !== b.fechaFinPlaneada) {
      if (a.fechaFinPlaneada === null) return 1;
      if (b.fechaFinPlaneada === null) return -1;
      return a.fechaFinPlaneada.localeCompare(b.fechaFinPlaneada);
    }
    return a.idSprint - b.idSprint;
  });
}

/**
 * Sprints por día de finalización esperada (`YYYY-MM-DD`), cada día ya en el
 * orden de supervisión. Un Sprint sin fecha planificada no cae en ningún día.
 */
export function groupSprintsByPlannedDay(
  items: readonly AdminSprintCalendarItem[],
): Map<string, AdminSprintCalendarItem[]> {
  const porDia = new Map<string, AdminSprintCalendarItem[]>();
  for (const item of sortSprintsForSupervision(items)) {
    if (item.fechaFinPlaneada === null) continue;
    const delDia = porDia.get(item.fechaFinPlaneada);
    if (delDia) delDia.push(item);
    else porDia.set(item.fechaFinPlaneada, [item]);
  }
  return porDia;
}

/** «2 finalizaciones planificadas» / «1 finalización planificada». */
export function contarFinalizaciones(cantidad: number): string {
  return cantidad === 1 ? '1 finalización planificada' : `${cantidad} finalizaciones planificadas`;
}

/** «8 oct 2026» para un día `YYYY-MM-DD`, sin correrlo por zona horaria. */
export function formatDiaConAnio(dia: string): string {
  const fecha = parseFechaSolo(dia);
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/** «8 de octubre de 2026» para un día `YYYY-MM-DD`. */
export function formatDiaLargoConAnio(dia: string): string {
  return `${formatDiaLargo(dia)} de ${parseFechaSolo(dia).getFullYear()}`;
}

/**
 * «31 mar 2026» para un INSTANTE ISO (p. ej. `fechaInicio`), leído como día
 * de Guatemala y no del navegador: un Sprint iniciado a las 22:00 de allá no
 * debe aparecer con la fecha del día siguiente a quien mira desde otro huso.
 */
export function formatInstanteGuatemala(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return formatDiaConAnio(partes);
}

/**
 * Texto que acompaña a la fecha cuando la píldora no lo dice ya: «En 6 días»
 * para un Sprint en curso y «Hace 2 días» para un plan vencido, con los días
 * restantes que calculó el backend. El resto de situaciones no lo necesita.
 */
export function describeDiasRestantes(item: AdminSprintCalendarItem): string | null {
  if (item.diasRestantes === null) return null;
  if (item.situacion !== 'EN_CURSO' && item.situacion !== 'PLAN_VENCIDO') return null;
  const texto = formatDiasRestantes(item.diasRestantes);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Destino de «Ver proyecto»: el detalle ADMINISTRATIVO, nunca el workspace del líder. */
export function adminProjectHref(idProyecto: number): string {
  return `/dashboard/admin/proyectos/${idProyecto}`;
}
