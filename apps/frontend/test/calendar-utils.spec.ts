import { describe, expect, it } from 'vitest';
import {
  formatMonthLabel,
  getMonthMatrix,
  parseFechaSolo,
  toDateKey,
} from '@/lib/calendar/utils';

describe('calendar/utils', () => {
  it('toDateKey formatea en yyyy-mm-dd local', () => {
    expect(toDateKey(new Date(2026, 4, 8))).toBe('2026-05-08');
    expect(toDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('parseFechaSolo no corre el día por huso horario (regresión UTC-6)', () => {
    // @db.Date llega serializado como instante UTC de medianoche; en un
    // huso negativo, new Date(iso) cae en el día anterior si no se corrige.
    const fecha = parseFechaSolo('2026-09-23T00:00:00.000Z');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(8); // septiembre = 8
    expect(fecha.getDate()).toBe(23);

    // también acepta el string corto "yyyy-mm-dd"
    expect(toDateKey(parseFechaSolo('2026-01-01'))).toBe('2026-01-01');
  });

  it('getMonthMatrix arma 6 semanas de lunes a domingo', () => {
    const weeks = getMonthMatrix(2026, 4); // mayo 2026
    expect(weeks).toHaveLength(6);
    weeks.forEach((week) => expect(week).toHaveLength(7));

    // cada semana empieza en lunes y termina en domingo
    weeks.forEach((week) => {
      expect(week[0].date.getDay()).toBe(1);
      expect(week[6].date.getDay()).toBe(0);
    });

    const diasDelMes = weeks.flat().filter((d) => d.inCurrentMonth);
    expect(diasDelMes).toHaveLength(31); // mayo tiene 31 días
    expect(diasDelMes[0].date.getDate()).toBe(1);
    expect(diasDelMes[diasDelMes.length - 1].date.getDate()).toBe(31);
  });

  it('formatMonthLabel capitaliza el mes en español', () => {
    expect(formatMonthLabel(2026, 4)).toBe('Mayo 2026');
    expect(formatMonthLabel(2026, 0)).toBe('Enero 2026');
  });
});
