import { describe, expect, it } from 'vitest';
import { construirSerieBurndown } from '../src/exports/burndown-series.util';
import type { SprintBurndownDto } from '../src/sprints/dto/sprint-burndown.dto';

/**
 * T-260 (HU-164): mismo algoritmo que `construirSerie` del frontend
 * (components/projects/burndown-chart.tsx) — portado tal cual para que el
 * burndown impreso en el PDF nunca diverja visualmente del que se ve en
 * pantalla. Los casos de este archivo espejan burndown-chart.spec.tsx.
 */

function burndown(overrides: Partial<SprintBurndownDto> = {}): SprintBurndownDto {
  return {
    idSprint: 1,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-15T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 13,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
      { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 1, puntosHistoriaRestantes: 10 },
    ],
    ...overrides,
  };
}

describe('construirSerieBurndown', () => {
  it('un día sin instantánea queda en null (hueco real), nunca interpolado', () => {
    const serie = construirSerieBurndown(
      burndown({
        fechaFinPlaneada: '2026-01-04T00:00:00.000Z',
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
          // 2026-01-02 falta a propósito.
          { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 2, tareasCompletadas: 2, puntosHistoriaRestantes: 6 },
        ],
      }),
      'puntos',
    );

    const dia2 = serie.find((punto) => punto.fecha.startsWith('2026-01-02'));
    expect(dia2?.real).toBeNull();
    const dia1 = serie.find((punto) => punto.fecha.startsWith('2026-01-01'));
    const dia3 = serie.find((punto) => punto.fecha.startsWith('2026-01-03'));
    expect(dia1?.real).toBe(13);
    expect(dia3?.real).toBe(6);
  });

  it('la línea ideal es una recta desde el total inicial en fechaInicio hasta 0 en fechaFinPlaneada', () => {
    const serie = construirSerieBurndown(
      burndown({
        fechaInicio: '2026-01-01T00:00:00.000Z',
        fechaFinPlaneada: '2026-01-05T00:00:00.000Z',
        puntosHistoriaPlanificadosTotal: 20,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 20 },
        ],
      }),
      'puntos',
    );

    expect(serie.find((p) => p.fecha.startsWith('2026-01-01'))?.ideal).toBe(20);
    expect(serie.find((p) => p.fecha.startsWith('2026-01-05'))?.ideal).toBe(0);
    expect(serie.find((p) => p.fecha.startsWith('2026-01-03'))?.ideal).toBe(10);
  });

  it('sin fechaFinPlaneada no hay línea ideal (todo null), nunca una recta inventada', () => {
    const serie = construirSerieBurndown(burndown({ fechaFinPlaneada: null }), 'puntos');

    expect(serie.every((punto) => punto.ideal === null)).toBe(true);
  });

  it('el eje "tareas" usa tareasPendientes/tareasPlanificadasTotal, nunca los campos de puntos', () => {
    const serie = construirSerieBurndown(
      burndown({
        tareasPlanificadasTotal: 4,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 99 },
        ],
      }),
      'tareas',
    );

    expect(serie.find((p) => p.fecha.startsWith('2026-01-01'))?.real).toBe(4);
  });
});
