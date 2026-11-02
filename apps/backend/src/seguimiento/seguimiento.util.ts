// Mismo huso fijo que tasks-due-reminder.service.ts: America/Guatemala no tiene horario de verano (UTC-6).
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;
export const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Hoy como medianoche UTC del día calendario de Guatemala, comparable con las columnas `@db.Date`. */
export function hoyGuatemala(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - DESFASE_GUATEMALA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Días enteros de `desde` a `hasta` (ambas medianoche UTC). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / UN_DIA_MS);
}

/** Fecha como `YYYY-MM-DD` (UTC). */
export const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
