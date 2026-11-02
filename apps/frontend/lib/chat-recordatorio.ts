/** MEJ-46: opciones de «Recuérdamelo» y comando de barra del compositor. */

const HORA_MS = 60 * 60 * 1000;

export interface OpcionRecordatorio {
  id: '1h' | '3h' | 'manana';
  etiqueta: string;
  fecha: Date;
}

/** Mañana a las 8:00 en la zona local del navegador. */
export function mananaOchoAm(ahora: Date): Date {
  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() + 1);
  fecha.setHours(8, 0, 0, 0);
  return fecha;
}

export function opcionesRecordatorio(ahora: Date = new Date()): OpcionRecordatorio[] {
  return [
    { id: '1h', etiqueta: 'En 1 hora', fecha: new Date(ahora.getTime() + HORA_MS) },
    { id: '3h', etiqueta: 'En 3 horas', fecha: new Date(ahora.getTime() + 3 * HORA_MS) },
    { id: 'manana', etiqueta: 'Mañana a las 8:00', fecha: mananaOchoAm(ahora) },
  ];
}

/** `datetime-local` (hora local, sin zona) -> Date; null si esta vacio o es invalido. */
export function fechaDesdeInputLocal(valor: string): Date | null {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Valor inicial/minimo del input `datetime-local` (hora local, a minuto). */
export function aInputLocal(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

/** El backend exige al menos 1 minuto de antelacion y hasta 90 dias. */
export function errorFechaRecordatorio(fecha: Date | null, ahora: Date = new Date()): string | null {
  if (!fecha) return 'Elige una fecha y hora.';
  const antelacion = fecha.getTime() - ahora.getTime();
  if (antelacion < 60_000) return 'La hora debe ser al menos 1 minuto en el futuro.';
  if (antelacion > 90 * 24 * HORA_MS) return 'El recordatorio no puede superar los 90 días.';
  return null;
}

/** `/recuerdamelo` o `/recuérdamelo` solos en el compositor (sin otro texto). */
export function esComandoRecordarme(texto: string): boolean {
  return /^\/recu[eé]rdamelo$/i.test(texto.trim());
}
