import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMonthLabel,
  formatWeekRangeLabel,
  getMonthMatrix,
  getWeekDays,
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

  it('getWeekDays devuelve 7 días de lunes a domingo conteniendo el ancla', () => {
    // 2026-09-23 es miércoles
    const dias = getWeekDays(new Date(2026, 8, 23));
    expect(dias).toHaveLength(7);
    expect(dias[0].date.getDay()).toBe(1); // lunes
    expect(dias[6].date.getDay()).toBe(0); // domingo
    expect(dias.some((d) => d.key === '2026-09-23')).toBe(true);
  });

  it('getWeekDays funciona cuando la semana cruza fin/inicio de mes', () => {
    // 2026-09-30 es miércoles; su semana va del 28 sep al 4 oct.
    const dias = getWeekDays(new Date(2026, 8, 30));
    expect(dias[0].key).toBe('2026-09-28');
    expect(dias[6].key).toBe('2026-10-04');
  });

  it('addDays suma/resta días en horario local sin corrimientos', () => {
    expect(toDateKey(addDays(new Date(2026, 8, 30), 1))).toBe('2026-10-01');
    expect(toDateKey(addDays(new Date(2026, 8, 1), -1))).toBe('2026-08-31');
  });

  it('formatWeekRangeLabel arma un rango legible', () => {
    const texto = formatWeekRangeLabel(new Date(2026, 8, 28), new Date(2026, 9, 4));
    expect(texto).toContain('28');
    expect(texto).toContain('4');
    expect(texto).toContain('2026');
  });
});
