import { describe, expect, it } from 'vitest';
import { calcularCoincidencia, mejorCoincidencia } from '../src/common/coincidencia-habilidades';

const mapa = (...pares: Array<[number, 'BASICO' | 'INTERMEDIO' | 'AVANZADO']>) => new Map(pares);

describe('calcularCoincidencia', () => {
  it('un rol sin requisitos no tiene coincidencia (null, no 0 %)', () => {
    expect(calcularCoincidencia([], mapa([1, 'AVANZADO']))).toBeNull();
  });

  it('cuenta los requisitos cumplidos sobre el total', () => {
    const c = calcularCoincidencia(
      [
        { idHabilidad: 1, nivelMinimo: 'BASICO' },
        { idHabilidad: 2, nivelMinimo: 'BASICO' },
        { idHabilidad: 3, nivelMinimo: 'BASICO' },
      ],
      mapa([1, 'BASICO'], [2, 'AVANZADO']),
    );
    expect(c).toMatchObject({ porcentaje: 67, cumplidos: 2, total: 3 });
  });

  it('el nivel debe alcanzar el mínimo', () => {
    const requisitos = [{ idHabilidad: 1, nivelMinimo: 'INTERMEDIO' as const }];
    expect(calcularCoincidencia(requisitos, mapa([1, 'BASICO']))?.porcentaje).toBe(0);
    expect(calcularCoincidencia(requisitos, mapa([1, 'INTERMEDIO']))?.porcentaje).toBe(100);
    expect(calcularCoincidencia(requisitos, mapa([1, 'AVANZADO']))?.porcentaje).toBe(100);
  });

  it('cumpleObligatorios solo mira los requisitos obligatorios (por defecto lo son)', () => {
    const requisitos = [
      { idHabilidad: 1, nivelMinimo: 'BASICO' as const, obligatorio: true },
      { idHabilidad: 2, nivelMinimo: 'BASICO' as const, obligatorio: false },
    ];
    expect(calcularCoincidencia(requisitos, mapa([1, 'BASICO']))?.cumpleObligatorios).toBe(true);
    expect(calcularCoincidencia(requisitos, mapa([2, 'BASICO']))?.cumpleObligatorios).toBe(false);
    expect(calcularCoincidencia([{ idHabilidad: 1, nivelMinimo: 'BASICO' }], mapa())?.cumpleObligatorios).toBe(false);
  });
});

describe('mejorCoincidencia', () => {
  it('elige la de mayor porcentaje e ignora los roles sin requisitos', () => {
    const baja = calcularCoincidencia([{ idHabilidad: 1, nivelMinimo: 'BASICO' }], mapa());
    const alta = calcularCoincidencia([{ idHabilidad: 1, nivelMinimo: 'BASICO' }], mapa([1, 'BASICO']));
    expect(mejorCoincidencia([null, baja, alta])?.porcentaje).toBe(100);
    expect(mejorCoincidencia([null, null])).toBeNull();
  });
});
