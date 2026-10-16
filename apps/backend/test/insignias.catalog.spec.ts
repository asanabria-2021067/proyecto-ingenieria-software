import { describe, expect, it } from 'vitest';
import { CATALOGO_INSIGNIAS, NIVELES, nivelPara, rangoNivel } from '../src/insignias/insignias.catalog';

describe('catálogo de insignias (HU-190)', () => {
  it('tiene exactamente los 7 logros con sus umbrales e iconos', () => {
    expect(CATALOGO_INSIGNIAS.map((c) => [c.clave, c.icono, ...c.umbrales])).toEqual([
      ['tareas', 'CheckCircle2', 1, 10, 50, 100],
      ['horas', 'Clock', 5, 25, 100, 250],
      ['cerrados', 'FolderCheck', 1, 3, 5, 10],
      ['liderados', 'Crown', 1, 2, 4, 8],
      ['postulaciones', 'UserCheck', 1, 3, 5, 10],
      ['comentarios', 'MessageSquare', 5, 25, 100, 250],
      ['sprints', 'Flag', 1, 5, 10, 20],
    ]);
  });

  it('los niveles van de Bronce a Diamante', () => {
    expect(NIVELES).toEqual(['BRONCE', 'PLATA', 'ORO', 'DIAMANTE']);
    expect([null, ...NIVELES].map(rangoNivel)).toEqual([0, 1, 2, 3, 4]);
  });

  describe.each(CATALOGO_INSIGNIAS)('$clave: límites exactos de cada umbral', ({ umbrales }) => {
    it.each(NIVELES.map((nivel, i) => ({ nivel, umbral: umbrales[i], previo: i === 0 ? null : NIVELES[i - 1] })))(
      '$nivel: umbral-1 no lo alcanza, umbral y umbral+1 sí',
      ({ nivel, umbral, previo }) => {
        expect(nivelPara(umbral - 1, umbrales)).toBe(previo);
        expect(nivelPara(umbral, umbrales)).toBe(nivel);
        // umbral+1 puede coincidir justo con el umbral del nivel siguiente (p. ej. liderados 1 -> 2).
        const siguiente = umbrales[NIVELES.indexOf(nivel) + 1];
        expect(nivelPara(umbral + 1, umbrales)).toBe(umbral + 1 === siguiente ? NIVELES[NIVELES.indexOf(nivel) + 1] : nivel);
      },
    );

    it('0 no da nivel y un valor enorme da Diamante', () => {
      expect(nivelPara(0, umbrales)).toBeNull();
      expect(nivelPara(umbrales[3] * 10, umbrales)).toBe('DIAMANTE');
    });
  });
});
