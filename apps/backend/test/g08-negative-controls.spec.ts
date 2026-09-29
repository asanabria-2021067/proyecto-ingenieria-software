import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
import { citedSpecs, specExists, tableRows } from './helpers/owasp-evidence';

/**
 * G08-C06 · OWASP25-C048 + pruebas negativas (A01–A10). Registro de los
 * controles negativos realmente ejecutados en G01–G08: cada entrada cita un
 * test o fixture que existe, la falla esperada, el resultado, la limpieza y la
 * referencia de evidencia. Sin PRs negativos remotos ni producción.
 */

const doc = readRepoFile('docs/security/negative-controls.md');
const rows = tableRows(doc, 'Registro');
const GATES = ['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07', 'G08'];

describe('G08-C06: controles negativos locales', () => {
  it('cada entrada tiene gate/control, test, falla esperada, resultado, limpieza y evidencia', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    rows.forEach((row, index) => {
      expect(row, `fila ${index + 1}`).toHaveLength(7);
      expect(Number(row[0])).toBe(index + 1);
      expect(row[1]).toMatch(/^G0\d · /);
      expect(citedSpecs(row[2]).length, row[0]).toBeGreaterThan(0);
      expect(row[3]).toMatch(/→/);
      expect(row[4]).toBe('Rechazado');
      expect(row[5].length).toBeGreaterThan(0);
      expect(row[6]).toMatch(/^G0\d-C\d{2}/);
    });
  });

  it('cada test o fixture citado existe en el repositorio', () => {
    expect(citedSpecs(doc).filter((name) => !specExists(name))).toEqual([]);
  });

  it('todos los gates de la workstream aportan al menos un control negativo', () => {
    for (const gate of GATES) {
      expect(rows.some((row) => row[1].startsWith(gate)), gate).toBe(true);
    }
  });

  it('el gate de cada entrada coincide con el de su evidencia', () => {
    for (const row of rows) {
      expect(row[6].slice(0, 3), row[0]).toBe(row[1].slice(0, 3));
    }
  });

  it('no exige PRs negativos remotos ni producción', () => {
    for (const row of rows) {
      expect(row.join(' '), row[0]).not.toMatch(/producci[oó]n|\bVM\b|pull request remoto|NT04/i);
    }
  });
});
