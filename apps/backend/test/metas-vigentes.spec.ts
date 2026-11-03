import { describe, expect, it } from 'vitest';
import { resolverMetas, selectRegistroActual } from '../src/horas-semestre/metas-vigentes';

describe('metas vigentes del semestre', () => {
  const legacy = { horasBecaRequeridas: 150, horasExtensionRequeridas: 40 };

  it('con registro del semestre ignora la meta legacy del perfil', () => {
    expect(resolverMetas([{ metaBeca: 80, metaExtension: 40 }], legacy)).toEqual({ beca: 80, extension: 40 });
    expect(resolverMetas([{ metaBeca: null, metaExtension: 40 }], legacy)).toEqual({ beca: null, extension: 40 });
  });

  it('sin registro usa la legacy, y sin ninguna devuelve null', () => {
    expect(resolverMetas([], legacy)).toEqual({ beca: 150, extension: 40 });
    expect(resolverMetas(undefined, legacy)).toEqual({ beca: 150, extension: 40 });
    expect(resolverMetas(undefined, null)).toEqual({ beca: null, extension: null });
  });

  it('el select filtra por el semestre de la fecha dada (hora de Guatemala)', () => {
    expect(selectRegistroActual(new Date('2026-11-03T12:00:00Z')).registrosHorasSemestre.where).toEqual({ anio: 2026, periodo: 2 });
    expect(selectRegistroActual(new Date('2026-03-03T12:00:00Z')).registrosHorasSemestre.where).toEqual({ anio: 2026, periodo: 1 });
  });
});
