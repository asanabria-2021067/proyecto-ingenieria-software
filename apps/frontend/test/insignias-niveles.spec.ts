import { describe, expect, it } from 'vitest';
import {
  NIVEL_ANILLO,
  NIVEL_NOMBRE,
  contadorNivel,
  etiquetaInsignia,
  fechaNivelActual,
  porcentajeSiguiente,
  siguienteNivel,
} from '../lib/insignias/niveles';
import type { InsigniaDto } from '../lib/types/insignias';

const fechas = { BRONCE: null, PLATA: null, ORO: null, DIAMANTE: null };

function insignia(overrides: Partial<InsigniaDto> = {}): InsigniaDto {
  return {
    clave: 'tareas',
    nombre: 'Tareas completadas',
    descripcion: 'd',
    icono: 'CheckCircle2',
    nivel: null,
    progreso: 0,
    umbrales: [1, 10, 50, 100],
    siguienteUmbral: 1,
    fechas,
    ...overrides,
  };
}

describe('niveles de insignias (HU-190)', () => {
  it('nombres en texto y anillo propio por nivel', () => {
    expect(NIVEL_NOMBRE).toEqual({ BRONCE: 'Bronce', PLATA: 'Plata', ORO: 'Oro', DIAMANTE: 'Diamante' });
    expect(new Set(Object.values(NIVEL_ANILLO)).size).toBe(4);
  });

  it('contador: Bronce y sin nivel no llevan; Plata x2, Oro x3, Diamante x4', () => {
    expect([null, 'BRONCE', 'PLATA', 'ORO', 'DIAMANTE'].map((n) => contadorNivel(n as never))).toEqual([
      null,
      null,
      'x2',
      'x3',
      'x4',
    ]);
  });

  it('siguienteNivel: Bronce si no hay nivel y null con Diamante', () => {
    expect([null, 'BRONCE', 'PLATA', 'ORO', 'DIAMANTE'].map((n) => siguienteNivel(n as never))).toEqual([
      'BRONCE',
      'PLATA',
      'ORO',
      'DIAMANTE',
      null,
    ]);
  });

  describe('porcentajeSiguiente', () => {
    it('sin nivel mide desde 0 hasta el umbral de Bronce', () => {
      expect(porcentajeSiguiente(insignia({ progreso: 0, siguienteUmbral: 5, umbrales: [5, 25, 100, 250] }))).toBe(0);
      expect(porcentajeSiguiente(insignia({ progreso: 2, siguienteUmbral: 4, umbrales: [4, 8, 12, 16] }))).toBe(50);
    });

    it('con nivel mide desde el umbral del nivel actual hasta el siguiente', () => {
      const base = { nivel: 'PLATA' as const, umbrales: [1, 10, 50, 100], siguienteUmbral: 50 };
      expect(porcentajeSiguiente(insignia({ ...base, progreso: 10 }))).toBe(0);
      expect(porcentajeSiguiente(insignia({ ...base, progreso: 30 }))).toBe(50);
      expect(porcentajeSiguiente(insignia({ ...base, progreso: 49 }))).toBe(98);
    });

    it('con Diamante es 100 y nunca sale del rango 0-100', () => {
      expect(porcentajeSiguiente(insignia({ nivel: 'DIAMANTE', progreso: 300, siguienteUmbral: null }))).toBe(100);
      expect(porcentajeSiguiente(insignia({ progreso: 99, siguienteUmbral: 5 }))).toBe(100);
    });
  });

  it('fechaNivelActual formatea la fecha del nivel actual y es null sin nivel o sin fecha', () => {
    expect(fechaNivelActual(insignia())).toBeNull();
    expect(fechaNivelActual(insignia({ nivel: 'ORO' }))).toBeNull();
    const texto = fechaNivelActual(insignia({ nivel: 'PLATA', fechas: { ...fechas, PLATA: '2026-10-12T15:00:00.000Z' } }));
    expect(texto).toMatch(/2026/);
    expect(texto).toMatch(/octubre/i);
  });

  it('etiquetaInsignia dice el nivel con palabras; bloqueada incluye el progreso', () => {
    expect(etiquetaInsignia(insignia({ nivel: 'ORO', progreso: 60, siguienteUmbral: 100 }))).toBe(
      'Tareas completadas, nivel Oro',
    );
    expect(etiquetaInsignia(insignia({ progreso: 0, siguienteUmbral: 1 }))).toBe(
      'Tareas completadas, bloqueada, progreso 0 de 1',
    );
  });
});
