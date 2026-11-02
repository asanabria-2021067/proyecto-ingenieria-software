export interface EventoIcs {
  idEvento: number;
  tituloEvento: string;
  descripcionEvento?: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  ubicacionNombre?: string | null;
  linkSesion?: string | null;
  antelacionMinutos?: number | null;
  proyecto?: { tituloProyecto: string } | null;
}

const fechaUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 §3.3.11: escapa \ ; , y saltos de línea. */
const texto = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 §3.1: líneas de 75 octetos como máximo; la continuación empieza con un espacio. */
function plegar(linea: string): string[] {
  const partes: string[] = [];
  let actual = '';
  for (const ch of linea) {
    const limite = partes.length === 0 ? 75 : 74;
    if (Buffer.byteLength(actual + ch) > limite) {
      partes.push(actual);
      actual = ch;
    } else actual += ch;
  }
  partes.push(actual);
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`));
}

export function enviarIcs(res: import('express').Response, ics: string, nombre: string): void {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.status(200).send(ics);
}

/** MEJ-33: calendario iCalendar (.ics) con los eventos dados; cada uno lleva su recordatorio. */
export function construirIcs(eventos: EventoIcs[], nombre = 'UVGenius', ahora: Date = new Date()): string {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UVGenius//Calendario//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${texto(nombre)}`];
  for (const e of eventos) {
    const descripcion = [e.descripcionEvento, e.linkSesion, e.proyecto ? `Proyecto: ${e.proyecto.tituloProyecto}` : null]
      .filter(Boolean)
      .join('\n');
    lineas.push(
      'BEGIN:VEVENT',
      `UID:evento-${e.idEvento}@uvgenius`,
      `DTSTAMP:${fechaUtc(ahora)}`,
      `DTSTART:${fechaUtc(e.fechaInicio)}`,
      `DTEND:${fechaUtc(e.fechaFin)}`,
      `SUMMARY:${texto(e.tituloEvento)}`,
    );
    if (descripcion) lineas.push(`DESCRIPTION:${texto(descripcion)}`);
    if (e.ubicacionNombre) lineas.push(`LOCATION:${texto(e.ubicacionNombre)}`);
    if (e.antelacionMinutos != null && e.antelacionMinutos > 0) {
      lineas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${texto(e.tituloEvento)}`, `TRIGGER:-PT${e.antelacionMinutos}M`, 'END:VALARM');
    }
    lineas.push('END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return lineas.flatMap(plegar).join('\r\n') + '\r\n';
}
