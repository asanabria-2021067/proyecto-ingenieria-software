import { describe, expect, it } from 'vitest';
import { construirIcs } from '../src/events/ics.util';

const AHORA = new Date('2026-11-02T12:00:00.000Z');

describe('construirIcs (MEJ-33)', () => {
  it('genera un VCALENDAR valido con CRLF, UID estable, fechas UTC y recordatorio', () => {
    const ics = construirIcs(
      [
        {
          idEvento: 7,
          tituloEvento: 'Reunión; sprint, 3',
          descripcionEvento: 'Línea 1\nLínea 2',
          fechaInicio: new Date('2026-11-05T15:00:00.000Z'),
          fechaFin: new Date('2026-11-05T16:30:00.000Z'),
          ubicacionNombre: 'Aula 101',
          antelacionMinutos: 60,
          proyecto: { tituloProyecto: 'Feria de Ciencias' },
        },
      ],
      'Mi calendario',
      AHORA,
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:evento-7@uvgenius\r\n');
    expect(ics).toContain('DTSTAMP:20261102T120000Z\r\n');
    expect(ics).toContain('DTSTART:20261105T150000Z\r\n');
    expect(ics).toContain('DTEND:20261105T163000Z\r\n');
    expect(ics).toContain('SUMMARY:Reunión\\; sprint\\, 3\r\n');
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2\\nProyecto: Feria de Ciencias\r\n');
    expect(ics).toContain('LOCATION:Aula 101\r\n');
    expect(ics).toContain('TRIGGER:-PT60M\r\n');
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it('sin eventos igual devuelve un calendario vacio y plega las lineas largas', () => {
    expect(construirIcs([], 'x', AHORA)).not.toContain('BEGIN:VEVENT');
    const ics = construirIcs(
      [{ idEvento: 1, tituloEvento: 'a'.repeat(200), fechaInicio: AHORA, fechaFin: AHORA }],
      'x',
      AHORA,
    );
    const lineas = ics.split('\r\n');
    expect(lineas.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(lineas.filter((l) => l.startsWith(' ')).length).toBeGreaterThan(0);
    expect(ics).not.toContain('VALARM');
  });
});
