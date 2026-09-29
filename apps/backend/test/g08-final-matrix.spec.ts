import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
import { CATEGORIES, tableRows } from './helpers/owasp-evidence';

/**
 * G08-C09 · OWASP25-C048 (A01–A10). Pasada final de la matriz: ningún control
 * queda sin estado final, todo PASS cita commits con evidencia indexada, los
 * riesgos residuales de código tienen owner, justificación y evidencia, y se
 * mantienen separados del handoff administrativo.
 */

const matrix = readRepoFile('docs/security/owasp-top10-2025.md');
const index = readRepoFile('docs/security/evidence-index.md');
const FINAL_STATES = ['PASS', 'SKIPPED_BY_PREFLIGHT', 'RESIDUAL_CODE_RISK', 'OUT_OF_SCOPE_ADMIN_HANDOFF', 'NOT_APPLICABLE'];

const indexedPass = new Set(
  index
    .split('\n')
    .filter((line) => /^\| G0\d-C\d{2} \|/.test(line) && /\| (PASS|IMPLEMENTED) \|$/.test(line))
    .map((line) => line.slice(2, 9)),
);

/** Expande `G02-C08…C12` y `G01-C07, C08` a IDs completos. */
export function expandIds(cell: string): string[] {
  const ids: string[] = [];
  for (const match of cell.matchAll(/(G0\d)-C(\d{2})(?:…C(\d{2}))?((?:,\s*C\d{2})*)/g)) {
    const [, gate, from, to, extra] = match;
    const last = Number(to ?? from);
    for (let n = Number(from); n <= last; n += 1) ids.push(`${gate}-C${String(n).padStart(2, '0')}`);
    for (const more of extra.matchAll(/C(\d{2})/g)) ids.push(`${gate}-C${more[1]}`);
  }
  return ids;
}

describe('G08-C09: matriz final y riesgos residuales', () => {
  it('A01–A10 tienen un estado final respaldado', () => {
    const summary = tableRows(matrix, 'Resumen A01–A10');
    expect(summary.map((row) => row[0].slice(0, 3))).toEqual(CATEGORIES);
    for (const row of summary) {
      expect(FINAL_STATES, row[0]).toContain(row[2]);
    }
  });

  it('no quedan controles en IMPLEMENTED y cada PASS cita commits con evidencia indexada', () => {
    const controls = tableRows(matrix, 'Controles de la Fase 2');
    for (const row of controls) {
      expect(FINAL_STATES, row[0]).toContain(row[6]);
      if (row[6] === 'PASS') {
        const ids = expandIds(row[4]);
        expect(ids.length, row[0]).toBeGreaterThan(0);
        const unindexed = ids.filter((id) => !indexedPass.has(id) && !id.startsWith('G08-'));
        expect(unindexed, row[0]).toEqual([]);
      }
    }
  });

  it('todos los gates G01–G07 aparecen como dueños de controles finales', () => {
    const gates = tableRows(matrix, 'Controles de la Fase 2').map((row) => row[3]).join(' ');
    for (const gate of ['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07', 'G08']) {
      expect(gates, gate).toContain(gate);
    }
  });

  it('cada riesgo residual de código tiene owner, justificación, evidencia y estado', () => {
    const risks = tableRows(matrix, 'Riesgos residuales de código (RESIDUAL_CODE_RISK)');
    expect(risks.length).toBeGreaterThanOrEqual(10);
    risks.forEach((row, position) => {
      expect(row[0]).toBe(`R${position + 1}`);
      for (const cell of [row[1], row[2], row[3], row[4], row[5]]) {
        expect(cell.length, row[0]).toBeGreaterThan(1);
      }
      expect(row[6], row[0]).toBe('RESIDUAL_CODE_RISK');
    });
  });

  it('las excepciones de dependencias con caducidad están como riesgo residual, con su fecha', () => {
    const risks = tableRows(matrix, 'Riesgos residuales de código (RESIDUAL_CODE_RISK)');
    const exceptions = readRepoFile('docs/security/dependency-exceptions.md');
    const register = exceptions.split('<!-- exceptions:start -->')[1].split('<!-- exceptions:end -->')[0];
    const dependencyRisk = risks.find((row) => row[5].includes('dependency-exceptions.md'));
    expect(dependencyRisk).toBeDefined();
    for (const expiry of new Set([...register.matchAll(/\| (\d{4}-\d{2}-\d{2}) \|/g)].map((match) => match[1]))) {
      expect(dependencyRisk?.[7], expiry).toContain(expiry);
    }
  });

  it('riesgo residual y handoff administrativo son conjuntos separados', () => {
    const risks = tableRows(matrix, 'Riesgos residuales de código (RESIDUAL_CODE_RISK)');
    const handoff = tableRows(matrix, 'Operaciones externas (OUT_OF_SCOPE_ADMIN_HANDOFF)');
    expect(risks.every((row) => row[6] === 'RESIDUAL_CODE_RISK')).toBe(true);
    expect(handoff.every((row) => row[2] === 'OUT_OF_SCOPE_ADMIN_HANDOFF')).toBe(true);
    const riskText = risks.map((row) => row[1]).join(' ');
    expect(riskText).not.toMatch(/GitHub Admin|environment `production`|nginx vivo|activar `/i);
  });

  it('los no aplicables se revalidaron con una razón concreta', () => {
    const rows = tableRows(matrix, 'Pospuestos y no aplicables').filter((row) => row[1] === 'NOT_APPLICABLE');
    expect(rows.map((row) => row[0].slice(0, 4))).toEqual(['C064', 'C065', 'C066', 'C067', 'C068', 'C069', 'C070']);
    for (const row of rows) {
      expect(row[2].length, row[0]).toBeGreaterThan(20);
    }
  });
});
