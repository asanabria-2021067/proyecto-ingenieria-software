import { describe, expect, it } from 'vitest';
import {
  GUATEMALA_TIME_ZONE,
  addDaysToDay,
  dateOnlyToDay,
  diffInDays,
  guatemalaDayOf,
  todayInGuatemala,
} from '../src/common/utils/guatemala-date';

describe('guatemala-date', () => {
  it('expone la zona horaria IANA de Guatemala', () => {
    expect(GUATEMALA_TIME_ZONE).toBe('America/Guatemala');
  });

  describe('todayInGuatemala', () => {
    it('a las 05:59Z todavía es el día anterior en Guatemala', () => {
      expect(todayInGuatemala(new Date('2026-10-15T05:59:59.999Z'))).toBe('2026-10-14');
    });

    it('a las 06:00Z comienza el nuevo día en Guatemala', () => {
      expect(todayInGuatemala(new Date('2026-10-15T06:00:00.000Z'))).toBe('2026-10-15');
    });

    it('sin argumento usa el reloj actual y devuelve YYYY-MM-DD', () => {
      expect(todayInGuatemala()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('guatemalaDayOf', () => {
    it('un instante de las 02:00Z pertenece al día anterior en Guatemala (20:00 locales)', () => {
      expect(guatemalaDayOf(new Date('2026-10-15T02:00:00.000Z'))).toBe('2026-10-14');
    });

    it('un instante de mediodía UTC pertenece al mismo día en Guatemala', () => {
      expect(guatemalaDayOf(new Date('2026-10-15T12:00:00.000Z'))).toBe('2026-10-15');
    });

    it('cruza el fin de año: 03:00Z del 1 de enero sigue siendo 31 de diciembre', () => {
      expect(guatemalaDayOf(new Date('2027-01-01T03:00:00.000Z'))).toBe('2026-12-31');
    });
  });

  describe('dateOnlyToDay', () => {
    it('lee una columna @db.Date (medianoche UTC) sin desplazarla al día anterior', () => {
      expect(dateOnlyToDay(new Date('2026-12-25T00:00:00.000Z'))).toBe('2026-12-25');
    });

    it('no coincide con el día de Guatemala de ese mismo instante: son conceptos distintos', () => {
      const fechaDb = new Date('2026-12-25T00:00:00.000Z');
      expect(guatemalaDayOf(fechaDb)).toBe('2026-12-24');
      expect(dateOnlyToDay(fechaDb)).toBe('2026-12-25');
    });
  });

  describe('addDaysToDay', () => {
    it('suma dentro del mismo mes', () => {
      expect(addDaysToDay('2026-10-03', 7)).toBe('2026-10-10');
    });

    it('cruza el fin de mes', () => {
      expect(addDaysToDay('2026-10-31', 1)).toBe('2026-11-01');
    });

    it('cruza el fin de año', () => {
      expect(addDaysToDay('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('respeta el 29 de febrero de un año bisiesto', () => {
      expect(addDaysToDay('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('resta con días negativos', () => {
      expect(addDaysToDay('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('sumar 0 devuelve el mismo día y 90 días es aritmética de calendario', () => {
      expect(addDaysToDay('2026-10-03', 0)).toBe('2026-10-03');
      expect(addDaysToDay('2026-10-03', 90)).toBe('2027-01-01');
    });
  });

  describe('diffInDays', () => {
    it('es negativo cuando a es anterior a b', () => {
      expect(diffInDays('2026-10-12', '2026-10-14')).toBe(-2);
    });

    it('es cero para el mismo día', () => {
      expect(diffInDays('2026-10-14', '2026-10-14')).toBe(0);
    });

    it('es positivo cuando a es posterior a b, también cruzando mes y año', () => {
      expect(diffInDays('2026-10-16', '2026-10-14')).toBe(2);
      expect(diffInDays('2027-01-01', '2026-12-31')).toBe(1);
    });

    it('es la inversa de addDaysToDay', () => {
      expect(diffInDays(addDaysToDay('2026-10-03', 45), '2026-10-03')).toBe(45);
    });
  });
});
