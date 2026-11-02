import { describe, expect, it } from 'vitest';
import {
  esEnRiesgo,
  necesitaRegistro,
  proyectarFechaMeta,
  semestreDe,
  semestreDeAnioPeriodo,
} from '../src/horas-semestre/semestre';

describe('semestreDe', () => {
  it('1 de enero y 30 de junio son del primer semestre', () => {
    expect(semestreDe(new Date('2026-01-01T12:00:00Z'))).toEqual({
      anio: 2026,
      periodo: 1,
      inicio: '2026-01-01',
      fin: '2026-06-30',
    });
    expect(semestreDe(new Date('2026-06-30T12:00:00Z')).periodo).toBe(1);
  });

  it('1 de julio y 31 de diciembre son del segundo semestre', () => {
    expect(semestreDe(new Date('2026-07-01T12:00:00Z'))).toEqual({
      anio: 2026,
      periodo: 2,
      inicio: '2026-07-01',
      fin: '2026-12-31',
    });
    expect(semestreDe(new Date('2026-12-31T12:00:00Z')).periodo).toBe(2);
  });

  it('usa la hora de Guatemala en los bordes', () => {
    // 01-jul 05:59Z sigue siendo 30-jun 23:59 en Guatemala
    expect(semestreDe(new Date('2026-07-01T05:59:59Z')).periodo).toBe(1);
    expect(semestreDe(new Date('2026-07-01T06:00:00Z')).periodo).toBe(2);
    // 01-ene 05:59Z de 2027 sigue siendo 31-dic de 2026
    expect(semestreDe(new Date('2027-01-01T05:59:59Z'))).toMatchObject({ anio: 2026, periodo: 2 });
    expect(semestreDe(new Date('2027-01-01T06:00:00Z'))).toMatchObject({ anio: 2027, periodo: 1 });
  });
});

describe('necesitaRegistro', () => {
  const base = { tieneRegistroActual: false, tieneAlgunRegistro: true };

  it('no pide nada si ya hay registro del semestre actual', () => {
    expect(necesitaRegistro({ ...base, hoy: '2026-03-01', tieneRegistroActual: true })).toBe(false);
  });

  it('pide desde el 5 de enero, no antes, a quien ya tuvo registros', () => {
    expect(necesitaRegistro({ ...base, hoy: '2027-01-04' })).toBe(false);
    expect(necesitaRegistro({ ...base, hoy: '2027-01-05' })).toBe(true);
  });

  it('pide desde el 1 de julio', () => {
    expect(necesitaRegistro({ ...base, hoy: '2026-06-30' })).toBe(true);
    expect(necesitaRegistro({ ...base, hoy: '2026-07-01' })).toBe(true);
  });

  it('la primera vez se pide aunque sea 1 de enero', () => {
    expect(necesitaRegistro({ hoy: '2027-01-02', tieneRegistroActual: false, tieneAlgunRegistro: false })).toBe(true);
  });
});

describe('proyectarFechaMeta', () => {
  const inicioSemestre = '2026-01-01';

  it('proyecta al ritmo actual', () => {
    // 10 dias transcurridos (1-10 ene), 10 horas: 1 h/dia, faltan 40 => 10-feb
    expect(proyectarFechaMeta({ avance: 10, meta: 50, inicioSemestre, hoy: '2026-01-10' })).toBe('2026-02-19');
  });

  it('si ya cumplio la meta devuelve hoy', () => {
    expect(proyectarFechaMeta({ avance: 60, meta: 50, inicioSemestre, hoy: '2026-03-01' })).toBe('2026-03-01');
  });

  it('sin avance o sin meta no hay proyeccion', () => {
    expect(proyectarFechaMeta({ avance: 0, meta: 50, inicioSemestre, hoy: '2026-03-01' })).toBeNull();
    expect(proyectarFechaMeta({ avance: 5, meta: null, inicioSemestre, hoy: '2026-03-01' })).toBeNull();
    expect(proyectarFechaMeta({ avance: 5, meta: 0, inicioSemestre, hoy: '2026-03-01' })).toBeNull();
  });
});

describe('esEnRiesgo', () => {
  const { inicio, fin } = semestreDeAnioPeriodo(2026, 1);

  it('a la mitad del semestre se marca por debajo de 30 % y no desde 30 %', () => {
    const mitad = '2026-04-01';
    expect(esEnRiesgo(29, inicio, fin, mitad)).toBe(true);
    expect(esEnRiesgo(31, inicio, fin, mitad)).toBe(false);
    expect(esEnRiesgo(50, inicio, fin, mitad)).toBe(false);
  });

  it('al inicio nadie esta en riesgo', () => {
    expect(esEnRiesgo(0, inicio, fin, '2026-01-01')).toBe(false);
  });

  it('al final del semestre con menos de 80 % esta en riesgo', () => {
    expect(esEnRiesgo(79, inicio, fin, '2026-06-30')).toBe(true);
    expect(esEnRiesgo(80, inicio, fin, '2026-06-30')).toBe(false);
  });

  it('fuera del semestre se acota el esperado a 0-100 %', () => {
    expect(esEnRiesgo(0, inicio, fin, '2025-12-01')).toBe(false);
    expect(esEnRiesgo(79, inicio, fin, '2026-09-01')).toBe(true);
  });
});
