import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawBurndownChart } from '../src/exports/burndown-chart.builder';
import type { SprintBurndownDto } from '../src/sprints/dto/sprint-burndown.dto';

function burndown(overrides: Partial<SprintBurndownDto> = {}): SprintBurndownDto {
  return {
    idSprint: 1,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-05T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 20,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 20 },
      { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 1, puntosHistoriaRestantes: 13 },
      { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 1, tareasCompletadas: 3, puntosHistoriaRestantes: 4 },
    ],
    ...overrides,
  };
}

function makeDoc() {
  return new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
}

describe('drawBurndownChart (T-260)', () => {
  it('con menos de 2 instantáneas: nota de datos insuficientes, sin dibujar ninguna línea', () => {
    const doc = makeDoc();
    const lineSpy = vi.spyOn(doc, 'line');

    const { textosRenderizados, finalY } = drawBurndownChart(doc, 3, burndown({ instantaneas: [] }), 100);

    expect(textosRenderizados.some((t) => t.includes('Aún no hay suficientes datos'))).toBe(true);
    expect(lineSpy).not.toHaveBeenCalled();
    expect(finalY).toBeGreaterThan(100);
  });

  it('con 2+ instantáneas: dibuja ejes y al menos un segmento de línea real', () => {
    const doc = makeDoc();
    const lineSpy = vi.spyOn(doc, 'line');
    const circleSpy = vi.spyOn(doc, 'circle');

    drawBurndownChart(doc, 3, burndown(), 100);

    // 2 líneas de ejes + al menos 1 segmento ideal + al menos 1 segmento real + 1 de leyenda real + 1 de leyenda ideal.
    expect(lineSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
    // Un punto (círculo) por cada instantánea real.
    expect(circleSpy).toHaveBeenCalledTimes(3);
  });

  it('incluye el número de Sprint y la métrica en el título', () => {
    const doc = makeDoc();

    const { textosRenderizados } = drawBurndownChart(doc, 7, burndown(), 100);

    expect(textosRenderizados.some((t) => t.includes('Sprint 7'))).toBe(true);
    expect(textosRenderizados.some((t) => t.includes('story points'))).toBe(true);
  });

  it('incluye la leyenda "Real" e "Ideal" cuando hay fechaFinPlaneada', () => {
    const doc = makeDoc();

    const { textosRenderizados } = drawBurndownChart(doc, 1, burndown(), 100);

    expect(textosRenderizados).toContain('Real');
    expect(textosRenderizados).toContain('Ideal');
  });

  it('sin fechaFinPlaneada: no dibuja línea ideal y lo indica en vez de la leyenda', () => {
    const doc = makeDoc();
    const dashSpy = vi.spyOn(doc, 'setLineDashPattern');

    const { textosRenderizados } = drawBurndownChart(doc, 1, burndown({ fechaFinPlaneada: null }), 100);

    expect(textosRenderizados).not.toContain('Ideal');
    expect(textosRenderizados.some((t) => t.includes('no se muestra línea ideal'))).toBe(true);
    // setLineDashPattern([...], 0) para restaurar el trazo sólido cuenta como
    // llamada aunque no haya ideal que dibujar — lo que importa es que nunca
    // se dibuja con el patrón punteado activo para la línea ideal (sin
    // llamadas de línea entre el dash-on y el dash-off de ese bloque).
    expect(dashSpy).not.toHaveBeenCalledWith([2, 1.5], 0);
  });

  it('genera un PDF válido de principio a fin con el gráfico incluido', () => {
    const doc = makeDoc();
    drawBurndownChart(doc, 1, burndown(), 100);

    const bytes = Buffer.from(doc.output('arraybuffer'));
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
