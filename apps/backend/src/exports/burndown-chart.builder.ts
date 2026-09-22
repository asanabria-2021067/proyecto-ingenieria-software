import type { jsPDF } from 'jspdf';
import { construirSerieBurndown } from './burndown-series.util';
import { formatFechaCsv } from './csv-export.util';
import type { SprintBurndownDto } from '../sprints/dto/sprint-burndown.dto';

/**
 * T-260 (HU-164): burndown IMPRESO — un gráfico de líneas vectorial dibujado
 * con las primitivas de jsPDF (nunca una imagen ni un navegador headless,
 * mismo invariante que el resto del render). Un solo tono de gris por línea
 * (real más oscuro y sólido, ideal más claro y punteado): en blanco y negro
 * nada depende del color, igual que el resto del PDF. Eje fijo en story
 * points (decisión del líder de proyecto, 2026-09-22) — el toggle
 * interactivo de la pantalla no tiene sentido en un documento estático.
 */
const CHART_LEFT = 40;
const CHART_WIDTH = 480;
const CHART_HEIGHT = 120;
const GRIS_REAL = 20;
const GRIS_IDEAL = 150;
const GRIS_EJE = 90;

export interface BurndownChartResult {
  finalY: number;
  textosRenderizados: string[];
}

export function drawBurndownChart(
  doc: jsPDF,
  numeroSprint: number,
  burndown: SprintBurndownDto,
  startY: number,
): BurndownChartResult {
  const textosRenderizados: string[] = [];
  const escribir = (texto: string, x: number, y: number, tamano: number) => {
    doc.setFontSize(tamano);
    doc.text(texto, x, y);
    textosRenderizados.push(texto);
  };

  escribir(`Burndown — Sprint ${numeroSprint} (story points)`, CHART_LEFT, startY, 11);

  // T-260/HU-160: mismo umbral que el gráfico en pantalla (BurndownChart) —
  // con menos de 2 instantáneas no hay línea real que trazar.
  if (burndown.instantaneas.length < 2) {
    const nota = 'Aún no hay suficientes datos para el burndown de este Sprint.';
    escribir(nota, CHART_LEFT, startY + 16, 9);
    return { finalY: startY + 30, textosRenderizados };
  }

  const serie = construirSerieBurndown(burndown, 'puntos');
  const valores = serie.flatMap((punto) => [punto.ideal, punto.real]).filter((v): v is number => v !== null);
  const maximo = Math.max(1, burndown.puntosHistoriaPlanificadosTotal, ...valores);

  const chartTop = startY + 12;
  const chartBottom = chartTop + CHART_HEIGHT;
  const chartRight = CHART_LEFT + CHART_WIDTH;
  const xFor = (indice: number) =>
    CHART_LEFT + (serie.length <= 1 ? 0 : (indice / (serie.length - 1)) * CHART_WIDTH);
  const yFor = (valor: number) => chartBottom - (valor / maximo) * CHART_HEIGHT;

  doc.setDrawColor(GRIS_EJE);
  doc.setLineWidth(0.75);
  doc.line(CHART_LEFT, chartTop, CHART_LEFT, chartBottom);
  doc.line(CHART_LEFT, chartBottom, chartRight, chartBottom);

  doc.setFontSize(8);
  doc.text(String(maximo), CHART_LEFT - 4, chartTop + 3, { align: 'right' });
  doc.text('0', CHART_LEFT - 4, chartBottom, { align: 'right' });

  // Línea ideal: recta completa (sin huecos) cuando existe fechaFinPlaneada.
  const hayIdeal = serie.some((punto) => punto.ideal !== null);
  if (hayIdeal) {
    doc.setDrawColor(GRIS_IDEAL);
    doc.setLineWidth(1);
    doc.setLineDashPattern([2, 1.5], 0);
    for (let i = 0; i < serie.length - 1; i++) {
      const actual = serie[i];
      const siguiente = serie[i + 1];
      if (actual.ideal !== null && siguiente.ideal !== null) {
        doc.line(xFor(i), yFor(actual.ideal), xFor(i + 1), yFor(siguiente.ideal));
      }
    }
    doc.setLineDashPattern([], 0);
  }

  // Línea real: solo conecta días CONSECUTIVOS con instantánea — un hueco
  // real (sin `connectNulls`) rompe la línea, igual que en pantalla.
  doc.setDrawColor(GRIS_REAL);
  doc.setFillColor(GRIS_REAL);
  doc.setLineWidth(1.25);
  for (let i = 0; i < serie.length - 1; i++) {
    const actual = serie[i];
    const siguiente = serie[i + 1];
    if (actual.real !== null && siguiente.real !== null) {
      doc.line(xFor(i), yFor(actual.real), xFor(i + 1), yFor(siguiente.real));
    }
  }
  for (let i = 0; i < serie.length; i++) {
    const punto = serie[i];
    if (punto.real !== null) {
      doc.circle(xFor(i), yFor(punto.real), 1.3, 'F');
    }
  }

  doc.setFontSize(8);
  doc.text(formatFechaCsv(new Date(serie[0].fecha)), CHART_LEFT, chartBottom + 10);
  doc.text(formatFechaCsv(new Date(serie[serie.length - 1].fecha)), chartRight, chartBottom + 10, {
    align: 'right',
  });

  const legendY = chartBottom + 24;
  doc.setDrawColor(GRIS_REAL);
  doc.setLineWidth(1.25);
  doc.line(CHART_LEFT, legendY, CHART_LEFT + 16, legendY);
  escribir('Real', CHART_LEFT + 20, legendY + 3, 8);

  if (hayIdeal) {
    doc.setDrawColor(GRIS_IDEAL);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.line(CHART_LEFT + 60, legendY, CHART_LEFT + 76, legendY);
    doc.setLineDashPattern([], 0);
    escribir('Ideal', CHART_LEFT + 80, legendY + 3, 8);
  } else {
    escribir('Sin fecha de fin planeada: no se muestra línea ideal.', CHART_LEFT + 60, legendY + 3, 8);
  }

  return { finalY: legendY + 18, textosRenderizados };
}
