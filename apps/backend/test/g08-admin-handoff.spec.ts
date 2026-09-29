import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
import { sensitiveFindings, tableRows } from './helpers/owasp-evidence';

/**
 * G08-C08 · OWASP25-C048 (A01–A10). Toda operación que exige GitHub Admin,
 * `main`, la VM, un deploy o producción figura EXCLUSIVAMENTE como
 * OUT_OF_SCOPE_ADMIN_HANDOFF, separada de la evidencia de código: ninguna
 * aparece como PASS/EXECUTED/DONE, no se copian comandos privilegiados ni
 * valores sensibles, y el runbook externo se referencia sin inventar IDs.
 */

const matrix = readRepoFile('docs/security/owasp-top10-2025.md');
const index = readRepoFile('docs/security/evidence-index.md');
const matrixHandoff = tableRows(matrix, 'Operaciones externas (OUT_OF_SCOPE_ADMIN_HANDOFF)');
const indexHandoff = tableRows(index, 'OUT_OF_SCOPE_ADMIN_HANDOFF (G08-C08)');
const GATES = ['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07'];

describe('G08-C08: handoff administrativo separado del código', () => {
  it('cada operación externa de la matriz está en OUT_OF_SCOPE_ADMIN_HANDOFF y con referencia', () => {
    expect(matrixHandoff.length).toBeGreaterThanOrEqual(15);
    for (const [operation, , state, reference] of matrixHandoff) {
      expect(state, operation).toBe('OUT_OF_SCOPE_ADMIN_HANDOFF');
      expect(reference.length, operation).toBeGreaterThan(0);
    }
  });

  it('el índice resume el handoff por gate con el mismo estado', () => {
    expect(indexHandoff.map((row) => row[0])).toEqual([...GATES, 'G08']);
    for (const row of indexHandoff) {
      expect(row[2], row[0]).toBe('OUT_OF_SCOPE_ADMIN_HANDOFF');
    }
  });

  it('todos los gates con operaciones externas aparecen en la matriz', () => {
    for (const gate of GATES) {
      expect(matrixHandoff.some((row) => row[1].includes(gate) || row[1] === 'Todos'), gate).toBe(true);
    }
  });

  it('ninguna operación externa figura como ejecutada, hecha o aprobada', () => {
    for (const row of [...matrixHandoff, ...indexHandoff]) {
      expect(row.slice(0, 3).join(' '), row[0]).not.toMatch(/\b(PASS|EXECUTED|DONE|APPROVED)\b/);
    }
  });

  it('el runbook externo se referencia sin inventar IDs de acción ni copiar comandos', () => {
    expect(matrix).toContain('09_GATE_ADMIN_HANDOFF_OWASP_2025.md');
    expect(matrix).toMatch(/no estaba disponible localmente/);
    const section = matrix.split('## Operaciones externas')[1]?.split('\n## ')[0] ?? '';
    expect(section).not.toMatch(/\bADM-\d+|\bOP-ADM-\d+/);
    expect(sensitiveFindings(section)).toEqual([]);
    expect(section).not.toMatch(/`(gh|ssh|sudo|scp|systemctl|nginx -s|docker compose (up|down|pull))\b/);
  });
});
