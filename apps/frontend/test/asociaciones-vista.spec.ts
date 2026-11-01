import { describe, expect, it } from 'vitest';
import {
  FILTROS_ASOCIACION_INICIALES,
  asociacionDeRuta,
  filtrosAsociacion,
  hayFiltrosAsociacion,
  puedePublicarComoAsociacion,
} from '../lib/asociaciones/vista';

describe('asociacionDeRuta', () => {
  it('reconoce la vista de asociación y su subrutas', () => {
    expect(asociacionDeRuta('/dashboard/asociacion/7')).toBe(7);
    expect(asociacionDeRuta('/dashboard/asociacion/12/otra')).toBe(12);
  });
  it('la vista de estudiante y otras rutas no son de asociación', () => {
    expect(asociacionDeRuta('/dashboard')).toBeNull();
    expect(asociacionDeRuta('/dashboard/admin/asociaciones')).toBeNull();
    expect(asociacionDeRuta('/dashboard/asociacion/abc')).toBeNull();
    expect(asociacionDeRuta(null)).toBeNull();
  });
});

describe('puedePublicarComoAsociacion', () => {
  it('Presidente y niveles Editor o superior publican; un Vocal de lectura no', () => {
    expect(puedePublicarComoAsociacion({ cargo: 'PRESIDENTE', nivelPermiso: 'LECTURA' })).toBe(true);
    expect(puedePublicarComoAsociacion({ cargo: 'TESORERO', nivelPermiso: 'EDITOR' })).toBe(true);
    expect(puedePublicarComoAsociacion({ cargo: 'VICEPRESIDENTE', nivelPermiso: 'ADMINISTRADOR' })).toBe(true);
    expect(puedePublicarComoAsociacion({ cargo: 'VOCAL', nivelPermiso: 'LECTURA' })).toBe(false);
  });
});

describe('filtrosAsociacion', () => {
  it('sin filtros no manda nada', () => {
    expect(filtrosAsociacion(FILTROS_ASOCIACION_INICIALES)).toEqual({});
    expect(hayFiltrosAsociacion(FILTROS_ASOCIACION_INICIALES)).toBe(false);
  });
  it('traduce semestre, tipo, riesgo y búsqueda al servidor', () => {
    const ui = { semestre: '2025-2', tipo: 'BECA' as const, enRiesgo: true, busqueda: '  ana ' };
    expect(filtrosAsociacion(ui)).toEqual({ anio: 2025, periodo: 2, tipo: 'BECA', enRiesgo: true, busqueda: 'ana' });
    expect(hayFiltrosAsociacion(ui)).toBe(true);
  });
});
