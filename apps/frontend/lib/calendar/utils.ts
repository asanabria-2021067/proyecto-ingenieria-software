export type CalendarDay = {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
};

export const WEEKDAY_LABELS_ES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const MONTH_LABELS_ES = [
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
 * Interpreta un campo de fecha SIN hora (p. ej. `Tarea.fechaLimite`, un
 * `@db.Date` de Postgres) como el día calendario que es, sin desplazarlo.
 * `new Date(isoString)` interpreta el string como un instante UTC: en un
 * huso horario negativo (Guatemala, UTC-6) "2026-09-23T00:00:00.000Z" cae en
 * 2026-09-22 18:00 local, y el día se corre uno hacia atrás. Se leen los
 * dígitos yyyy-mm-dd directamente y se construye la fecha en horario local.
 */
export function parseFechaSolo(fecha: string): Date {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Clave estable yyyy-mm-dd en horario local (no UTC), para agrupar/comparar días sin depender de la hora. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Devuelve el mes (0-indexado) como 6 semanas de lunes a domingo (42 días),
 * rellenando con días del mes adyacente para completar la cuadrícula.
 */
export function getMonthMatrix(year: number, month: number): CalendarDay[][] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
  const start = new Date(year, month, 1 - firstWeekday);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    days.push({
      date,
      key: toDateKey(date),
      inCurrentMonth: date.getMonth() === month,
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(days.slice(w * 7, w * 7 + 7));
  return weeks;
}

export function formatMonthLabel(year: number, month: number): string {
  const label = MONTH_LABELS_ES[month];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
}
