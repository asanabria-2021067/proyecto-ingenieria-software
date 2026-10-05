import { parseFechaSolo } from '@/lib/calendar/utils';
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
  PLAN_VENCIDO: 'bg-attention/15 text-attention-strong',
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

/** Nombre accesible de un día marcado: «8 de octubre, 3 finalizaciones planificadas». */
export function describePlannedDay(dia: string, cantidad: number): string {
  const sufijo = cantidad === 1 ? '1 finalización planificada' : `${cantidad} finalizaciones planificadas`;
  return `${formatDiaLargo(dia)}, ${sufijo}`;
}
