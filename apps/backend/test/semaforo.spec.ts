import { describe, expect, it } from 'vitest';
import { AYUDA_SEMAFORO, calcularSemaforo, type EntradaSemaforo } from '../src/seguimiento/semaforo';

const sana: EntradaSemaforo = {
  hitosAtrasados: 0,
  hitosProximos: 0,
  tareasAbiertas: 10,
  tareasVencidas: 0,
  sprint: { avancePct: 50, transcurridoPct: 50 },
};
const con = (cambios: Partial<EntradaSemaforo>): EntradaSemaforo => ({ ...sana, ...cambios });

describe('semáforo del proyecto (MEJ-55)', () => {
  it('verde sin alertas y sin sprint', () => {
    expect(calcularSemaforo(sana)).toEqual({ color: 'VERDE', motivos: [] });
    expect(calcularSemaforo(con({ sprint: null })).color).toBe('VERDE');
  });

  it('un hito atrasado es rojo aunque todo lo demás esté bien', () => {
    expect(calcularSemaforo(con({ hitosAtrasados: 1 }))).toEqual({ color: 'ROJO', motivos: ['1 hito atrasado'] });
    expect(calcularSemaforo(con({ hitosAtrasados: 2 })).motivos).toEqual(['2 hitos atrasados']);
  });

  it('tareas vencidas: amarillo bajo 25% de las abiertas y rojo desde 25%', () => {
    expect(calcularSemaforo(con({ tareasVencidas: 2 })).color).toBe('AMARILLO');
    expect(calcularSemaforo(con({ tareasVencidas: 3 })).color).toBe('ROJO'); // 3/10 = 30%
    expect(calcularSemaforo(con({ tareasVencidas: 5 })).color).toBe('ROJO'); // 5/10 = 50%
    expect(calcularSemaforo(con({ tareasAbiertas: 8, tareasVencidas: 2 })).color).toBe('ROJO'); // 2/8 = 25% exacto
    expect(calcularSemaforo(con({ tareasAbiertas: 0, tareasVencidas: 0 })).color).toBe('VERDE');
  });

  it('un hito por vencer es amarillo', () => {
    expect(calcularSemaforo(con({ hitosProximos: 1 }))).toEqual({
      color: 'AMARILLO',
      motivos: ['1 hito vence en 3 días o menos'],
    });
  });

  it.each([
    [14, 'VERDE'],
    [15, 'AMARILLO'],
    [29, 'AMARILLO'],
    [30, 'ROJO'],
    [80, 'ROJO'],
  ])('sprint con %i puntos de atraso es %s', (atraso, color) => {
    const r = calcularSemaforo(con({ sprint: { avancePct: 10, transcurridoPct: 10 + atraso } }));
    expect(r.color).toBe(color);
  });

  it('el sprint adelantado o sin atraso no resta ni suma', () => {
    expect(calcularSemaforo(con({ sprint: { avancePct: 90, transcurridoPct: 20 } })).color).toBe('VERDE');
    expect(calcularSemaforo(con({ sprint: { avancePct: 0, transcurridoPct: 0 } })).color).toBe('VERDE');
  });

  it('limita los porcentajes fuera de 0-100 antes de comparar', () => {
    // transcurrido 400% (sprint pasado de fecha) con avance 100% cuenta como 0 de atraso.
    expect(calcularSemaforo(con({ sprint: { avancePct: 100, transcurridoPct: 400 } })).color).toBe('VERDE');
    expect(calcularSemaforo(con({ sprint: { avancePct: -50, transcurridoPct: 50 } })).color).toBe('ROJO');
  });

  it('el peor criterio manda y los motivos incluyen los amarillos', () => {
    const r = calcularSemaforo(con({ hitosAtrasados: 1, tareasVencidas: 1, hitosProximos: 2 }));
    expect(r.color).toBe('ROJO');
    expect(r.motivos).toEqual(['1 hito atrasado', '1 tarea vencida', '2 hitos vencen en 3 días o menos']);
  });

  it('tiene texto de ayuda para los tres colores', () => {
    expect(Object.keys(AYUDA_SEMAFORO).sort()).toEqual(['AMARILLO', 'ROJO', 'VERDE']);
    Object.values(AYUDA_SEMAFORO).forEach((t) => expect(t.length).toBeGreaterThan(20));
  });
});
