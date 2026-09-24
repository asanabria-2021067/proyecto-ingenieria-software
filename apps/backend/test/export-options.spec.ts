import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_EXPORT_OPTIONS,
  colorTablaRgb,
  parseExportOptions,
  tamanosDeFuente,
} from '../src/exports/export-options';

describe('parseExportOptions (revisión del PR: opciones de exportación)', () => {
  it('sin parámetros devuelve los valores por defecto: todo el contenido, fuente mediana, tablas grises, sin gráficas ni rango', () => {
    expect(parseExportOptions({})).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(DEFAULT_EXPORT_OPTIONS).toMatchObject({
      fuente: 'mediana',
      colorTablas: 'gris',
      secciones: ['miembros', 'avance', 'burndown'],
      graficas: [],
      desde: null,
      hasta: null,
    });
  });

  it('acepta fuente, color, secciones y gráficas válidos', () => {
    const o = parseExportOptions({
      fuente: 'grande',
      color: 'azul',
      secciones: 'miembros,avance',
      graficas: 'barras,pastel',
    });

    expect(o.fuente).toBe('grande');
    expect(o.colorTablas).toBe('azul');
    expect(o.secciones).toEqual(['miembros', 'avance']);
    expect(o.graficas).toEqual(['barras', 'pastel']);
  });

  it('parsea el rango de fechas como día UTC', () => {
    const o = parseExportOptions({ desde: '2026-02-01', hasta: '2026-03-15' });

    expect(o.desde?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(o.hasta?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('acepta solo desde o solo hasta', () => {
    expect(parseExportOptions({ desde: '2026-02-01' }).hasta).toBeNull();
    expect(parseExportOptions({ hasta: '2026-02-01' }).desde).toBeNull();
  });

  it.each([
    [{ fuente: 'enorme' }],
    [{ color: 'fucsia' }],
    [{ secciones: 'miembros,otra' }],
    [{ graficas: 'lineas' }],
    [{ desde: '01/02/2026' }],
    [{ desde: '2026-13-40' }],
    [{ desde: '2026-03-10', hasta: '2026-03-01' }],
  ])('rechaza con 400 un valor inválido: %j', (query) => {
    expect(() => parseExportOptions(query)).toThrow(BadRequestException);
  });

  it('rechaza con 400 no elegir ningún dato a exportar', () => {
    expect(() => parseExportOptions({ secciones: '' })).toThrow(BadRequestException);
  });

  it('deduplica secciones y gráficas repetidas', () => {
    const o = parseExportOptions({ secciones: 'miembros,miembros', graficas: 'barras,barras' });

    expect(o.secciones).toEqual(['miembros']);
    expect(o.graficas).toEqual(['barras']);
  });
});

describe('tamanosDeFuente / colorTablaRgb', () => {
  it('la fuente mediana conserva los tamaños originales del reporte (tabla 9, texto 11, sección 13, título 16)', () => {
    expect(tamanosDeFuente('mediana')).toEqual({ tabla: 9, texto: 11, seccion: 13, titulo: 16 });
  });

  it('pequeña < mediana < grande', () => {
    expect(tamanosDeFuente('pequena').tabla).toBeLessThan(tamanosDeFuente('mediana').tabla);
    expect(tamanosDeFuente('grande').tabla).toBeGreaterThan(tamanosDeFuente('mediana').tabla);
  });

  it('cada color de tabla es un RGB oscuro (texto blanco legible y distinguible en blanco y negro)', () => {
    for (const c of ['gris', 'azul', 'verde', 'rojo'] as const) {
      const [r, g, b] = colorTablaRgb(c);
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(160);
    }
  });
});
