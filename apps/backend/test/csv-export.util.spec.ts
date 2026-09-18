import { describe, expect, it } from 'vitest';
import { buildCsv, formatFechaCsv } from '../src/exports/csv-export.util';

/**
 * T-259/T-262 (HU-164): el error clásico de un CSV que "se ve roto" en Excel
 * en español es la codificación/el separador, no los datos — de ahí el foco
 * de este archivo en BOM, separador `;` y acentos/ñ, más que en el contenido.
 */
describe('buildCsv', () => {
  it('antepone el BOM UTF-8 para que Excel en español detecte la codificación', () => {
    const csv = buildCsv(['Nombre'], [['Ana']]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('usa `;` como separador, el que Excel en español espera por el `,` decimal', () => {
    const csv = buildCsv(['Nombre', 'Horas'], [['Ana', 10]]);

    expect(csv).toContain('Nombre;Horas');
    expect(csv).toContain('Ana;10');
  });

  it('conserva acentos y ñ sin escaparlos ni corromperlos', () => {
    const csv = buildCsv(['Nombre'], [['Peña Muñoz, José Andrés']]);

    expect(csv).toContain('Peña Muñoz, José Andrés');
  });

  it('envuelve entre comillas un campo que contiene el separador', () => {
    const csv = buildCsv(['Nota'], [['Beca; extensión']]);

    expect(csv).toContain('"Beca; extensión"');
  });

  it('duplica las comillas internas y envuelve el campo entre comillas', () => {
    const csv = buildCsv(['Nota'], [['Dijo "listo"']]);

    expect(csv).toContain('"Dijo ""listo"""');
  });

  it('envuelve entre comillas un campo con salto de línea', () => {
    const csv = buildCsv(['Nota'], [['Línea 1\nLínea 2']]);

    expect(csv).toContain('"Línea 1\nLínea 2"');
  });

  it('termina cada fila con CRLF', () => {
    const csv = buildCsv(['A', 'B'], [['1', '2']]);

    expect(csv).toMatch(/A;B\r\n1;2\r\n$/);
  });

  it('genera solo la cabecera cuando no hay filas, sin fallar', () => {
    const csv = buildCsv(['Nombre', 'Horas'], []);

    expect(csv).toBe('﻿Nombre;Horas\r\n');
  });
});

describe('formatFechaCsv', () => {
  it('formatea a DD/MM/AAAA', () => {
    expect(formatFechaCsv(new Date('2026-03-05T00:00:00.000Z'))).toBe('05/03/2026');
  });

  it('devuelve cadena vacía para null', () => {
    expect(formatFechaCsv(null)).toBe('');
  });
});
