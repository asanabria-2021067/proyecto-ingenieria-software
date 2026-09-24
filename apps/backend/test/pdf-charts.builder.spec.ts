import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { EstadoParticipacion } from '@prisma/client';
import { drawBarChart, drawPieChart } from '../src/exports/pdf-charts.builder';
import type { ProjectExportMemberDto } from '../src/exports/dto/project-export.dto';

function miembro(id: number, nombre: string, confirmadas: number, pendientes: number): ProjectExportMemberDto {
  return {
    idUsuario: id,
    nombre,
    apellido: 'Pérez',
    correo: `${nombre}@uvg.edu.gt`,
    rol: 'Dev',
    estadoParticipacion: EstadoParticipacion.ACTIVO,
    grupo: 'ACTIVOS',
    horasConfirmadas: confirmadas,
    horasPendientes: pendientes,
  };
}

const MIEMBROS = [miembro(1, 'José', 12.5, 3), miembro(2, 'Ñandú', 8, 0), miembro(3, 'Ana', 4, 4)];

function makeDoc() {
  return new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
}

describe('drawBarChart (revisión del PR: gráfica de barras)', () => {
  it('dibuja dos barras por integrante (confirmadas y pendientes) y un título', () => {
    const doc = makeDoc();
    const rectSpy = vi.spyOn(doc, 'rect');

    const { textos, finalY } = drawBarChart(doc, MIEMBROS, 100, 'azul');

    expect(textos.some((t) => t.includes('Horas por integrante'))).toBe(true);
    // 3 integrantes × 2 barras + 2 muestras de la leyenda.
    expect(rectSpy.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(finalY).toBeGreaterThan(100);
  });

  it('rotula cada integrante con su nombre (acentos y ñ intactos) y la leyenda', () => {
    const { textos } = drawBarChart(makeDoc(), MIEMBROS, 100, 'gris');

    expect(textos.some((t) => t.includes('Ñandú'))).toBe(true);
    expect(textos).toContain('Horas confirmadas');
    expect(textos).toContain('Horas pendientes');
  });

  it('sin integrantes avisa en vez de dibujar barras', () => {
    const doc = makeDoc();
    const rectSpy = vi.spyOn(doc, 'rect');

    const { textos } = drawBarChart(doc, [], 100, 'gris');

    expect(textos.some((t) => t.includes('Sin integrantes para graficar'))).toBe(true);
    expect(rectSpy).not.toHaveBeenCalled();
  });

  it('con todas las horas en cero no divide entre cero y genera un PDF válido', () => {
    const doc = makeDoc();
    drawBarChart(doc, [miembro(1, 'Luz', 0, 0)], 100, 'rojo');

    expect(Buffer.from(doc.output('arraybuffer')).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('drawPieChart (revisión del PR: gráfica de pastel)', () => {
  it('dibuja el pastel con triángulos rellenos y una leyenda con horas y porcentaje por integrante', () => {
    const doc = makeDoc();
    const triSpy = vi.spyOn(doc, 'triangle');

    const { textos } = drawPieChart(doc, MIEMBROS, 100, 'verde');

    expect(triSpy).toHaveBeenCalled();
    expect(textos.some((t) => t.includes('Distribución de horas'))).toBe(true);
    // José: 15.5 de 31.5 horas = 49 %.
    expect(textos.some((t) => t.includes('José Pérez') && t.includes('15.50 h') && t.includes('49 %'))).toBe(true);
  });

  it('los porcentajes de la leyenda suman 100', () => {
    const { textos } = drawPieChart(makeDoc(), MIEMBROS, 100, 'gris');

    const porcentajes = textos
      .map((t) => /\((\d+) %\)/.exec(t)?.[1])
      .filter((p): p is string => p !== undefined)
      .map(Number);
    expect(porcentajes.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('agrupa en "Otros" a partir del noveno integrante para no desbordar la leyenda', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => miembro(i + 1, `M${i + 1}`, 10 - i * 0.5, 0));

    const { textos } = drawPieChart(makeDoc(), muchos, 100, 'gris');

    expect(textos.some((t) => t.startsWith('Otros'))).toBe(true);
    expect(textos.filter((t) => /\(\d+ %\)/.test(t))).toHaveLength(9);
  });

  it('sin horas que repartir avisa en vez de dibujar un pastel vacío', () => {
    const doc = makeDoc();
    const triSpy = vi.spyOn(doc, 'triangle');

    const { textos } = drawPieChart(doc, [miembro(1, 'Luz', 0, 0)], 100, 'gris');

    expect(textos.some((t) => t.includes('Sin horas para graficar'))).toBe(true);
    expect(triSpy).not.toHaveBeenCalled();
  });
});
