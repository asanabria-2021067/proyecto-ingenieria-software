import { describe, expect, it } from 'vitest';
import { avanceSobreMetas, compararEstudiantes } from '../src/horas-semestre/orden-estudiantes';

const fila = (idUsuario: number, p: Partial<Parameters<typeof avanceSobreMetas>[0]> = {}) => ({
  idUsuario,
  enRiesgo: false,
  metaBeca: null,
  becaDeclarada: 0,
  becaAcreditada: 0,
  metaExtension: null,
  extensionDeclarada: 0,
  extensionAcreditada: 0,
  ...p,
});
const ids = (filas: ReturnType<typeof fila>[], tipo?: 'BECA' | 'EXTENSION') =>
  [...filas].sort(compararEstudiantes(tipo)).map((f) => f.idUsuario);

describe('compararEstudiantes', () => {
  it('pone primero a los en riesgo, luego las metas de menor a mayor avance y al final a los sin metas', () => {
    const filas = [
      fila(1),
      fila(2, { metaBeca: 100, becaDeclarada: 90 }),
      fila(3, { metaBeca: 100, becaDeclarada: 40 }),
      fila(4, { metaBeca: 100, becaDeclarada: 20, enRiesgo: true }),
      fila(5, { metaBeca: 100, becaDeclarada: 5, enRiesgo: true }),
      fila(6, { metaBeca: 0 }),
    ];
    expect(ids(filas)).toEqual([5, 4, 3, 2, 1, 6]);
  });

  it('el avance suma declaradas y acreditadas sobre la suma de metas', () => {
    expect(avanceSobreMetas(fila(1, { metaBeca: 50, becaDeclarada: 10, becaAcreditada: 15, metaExtension: 50, extensionDeclarada: 25 }))).toBe(0.5);
  });

  it('desempata por idUsuario, asi el orden es total', () => {
    const filas = [fila(9, { metaBeca: 10, becaDeclarada: 5 }), fila(3, { metaBeca: 20, becaDeclarada: 10 }), fila(7)];
    expect(ids(filas)).toEqual([3, 9, 7]);
    expect(ids([...filas].reverse())).toEqual([3, 9, 7]);
  });

  it('con tipo solo cuentan las metas de ese tipo; sin meta de ese tipo queda entre los sin metas', () => {
    const soloExtension = fila(1, { metaExtension: 10, extensionDeclarada: 1 });
    const conBeca = fila(2, { metaBeca: 10, becaDeclarada: 9, metaExtension: 10, extensionDeclarada: 0 });
    expect(ids([soloExtension, conBeca], 'BECA')).toEqual([2, 1]);
    expect(ids([soloExtension, conBeca], 'EXTENSION')).toEqual([2, 1]);
    expect(ids([conBeca, soloExtension])).toEqual([1, 2]);
  });
});
