/**
 * Días calendario en America/Guatemala, siempre como cadenas `YYYY-MM-DD`.
 *
 * El proceso y PostgreSQL corren en UTC; entre las 18:00 y las 23:59 de
 * Guatemala el día UTC ya es "mañana". Toda lógica que compare una columna
 * `@db.Date` contra "hoy" o contra un instante debe pasar por aquí en lugar
 * de usar `new Date()` o getters locales. Las cadenas `YYYY-MM-DD` se
 * comparan lexicográficamente, que equivale al orden cronológico.
 *
 * Funciones puras: no dependen de la zona horaria del proceso, de Prisma ni
 * de NestJS.
 */
export const GUATEMALA_TIME_ZONE = 'America/Guatemala';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

const guatemalaDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: GUATEMALA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario de Guatemala al que pertenece un instante. */
export function guatemalaDayOf(instant: Date): string {
  return guatemalaDayFormatter.format(instant);
}

/** Día calendario actual en Guatemala; `now` permite fijar el reloj en tests. */
export function todayInGuatemala(now: Date = new Date()): string {
  return guatemalaDayOf(now);
}

/**
 * Día calendario de una columna `@db.Date`. Prisma la entrega como medianoche
 * UTC del día almacenado, así que se lee en UTC: un getter local la
 * desplazaría al día anterior en un proceso al oeste de UTC.
 */
export function dateOnlyToDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

/** Suma (o resta, con `days` negativo) días calendario a un `YYYY-MM-DD`. */
export function addDaysToDay(day: string, days: number): string {
  return new Date(dayToUtcMs(day) + days * UN_DIA_MS).toISOString().slice(0, 10);
}

/** Diferencia `a - b` en días calendario; negativa si `a` es anterior a `b`. */
export function diffInDays(a: string, b: string): number {
  return Math.round((dayToUtcMs(a) - dayToUtcMs(b)) / UN_DIA_MS);
}
