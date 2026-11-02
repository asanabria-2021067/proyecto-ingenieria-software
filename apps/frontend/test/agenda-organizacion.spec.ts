import { describe, expect, it } from 'vitest';
import { agruparPorDia, mesSiguiente, rangoDelMes } from '@/lib/calendar/agenda-organizacion';

describe('agenda de la organizacion (MEJ-34)', () => {
  it('el rango cubre el mes completo en hora local y cabe en el tope de 62 dias', () => {
    const { desde, hasta } = rangoDelMes(new Date(2026, 10, 17));
    expect([desde.getFullYear(), desde.getMonth(), desde.getDate(), desde.getHours()]).toEqual([2026, 10, 1, 0]);
    expect([hasta.getMonth(), hasta.getDate(), hasta.getHours()]).toEqual([10, 30, 23]);
    expect((hasta.getTime() - desde.getTime()) / 86_400_000).toBeLessThan(62);
  });

  it('mesSiguiente cruza de año en ambos sentidos', () => {
    expect(mesSiguiente(new Date(2026, 11, 15), 1)).toEqual(new Date(2027, 0, 1));
    expect(mesSiguiente(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
  });

  it('agrupa por dia local y ordena los dias, conservando el orden dentro de cada uno', () => {
    const e = (id: number, y: number, m: number, d: number, h: number) => ({ id, fechaInicio: new Date(y, m, d, h).toISOString() });
    const grupos = agruparPorDia([e(1, 2026, 10, 5, 9), e(2, 2026, 10, 3, 18), e(3, 2026, 10, 5, 14)]);
    expect(grupos.map(([clave, items]) => [clave, items.map((i) => i.id)])).toEqual([
      ['2026-11-03', [2]],
      ['2026-11-05', [1, 3]],
    ]);
    expect(agruparPorDia([])).toEqual([]);
  });
});
