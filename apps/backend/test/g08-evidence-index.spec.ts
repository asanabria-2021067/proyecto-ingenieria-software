import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
import { STATES, TRACE, citedSpecs, git, gitAvailable, historyCommitIds, specExists, tableRows } from './helpers/owasp-evidence';

/**
 * G08-C05 · OWASP25-C048 (A01–A10). Índice durable control → gate/commit →
 * test → evidencia. Cada fila usa el ID estable `Gxx-Cnn` y el SHA REAL del
 * historial local; todo commit trazable de los gates indexados tiene fila, los
 * tests citados existen y ninguna fila de código depende de evidencia
 * productiva o remota. G08-C07 ancla G01 (PASS) y G02 (PASS_SCOPE_V2, sin
 * G02-C03) como baseline de código y clasifica HU-159 como preexistente.
 */

// G08-C07: G01 y G02 se anclan como baseline de código; desde aquí se indexa toda la workstream.
export const INDEXED_GATES = ['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07', 'G08'];
const index = readRepoFile('docs/security/evidence-index.md');
const allowlist = JSON.parse(readRepoFile('docs/security/owasp-delta-allowlist.json')) as { notExecuted: Array<{ id: string }> };
const NOT_EXECUTED = allowlist.notExecuted.map((entry) => entry.id);

export interface IndexRow {
  id: string;
  sha: string;
  control: string;
  owasp: string;
  tests: string;
  command: string;
  result: string;
  audit: string;
  rollback: string;
  state: string;
}

export function indexRows(source: string): IndexRow[] {
  return source
    .split('\n')
    .filter((line) => /^\| G0\d-C\d{2} \|/.test(line))
    .map((line) => {
      const [id, sha, control, owasp, tests, command, result, audit, rollback, state] = line.split(' | ').map((cell) => cell.replace(/^\| |\s*\|$/g, '').trim());
      return { id, sha: sha.replace(/`/g, ''), control, owasp, tests, command, result, audit, rollback, state };
    });
}

const rows = indexRows(index);

describe('G08-C05: índice de evidencia', () => {
  it('cada fila tiene un ID único, un estado del catálogo y todos los campos', () => {
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of rows.filter((entry) => entry.state !== 'OUT_OF_SCOPE_ADMIN_HANDOFF')) {
      expect(STATES, row.id).toContain(row.state);
      for (const field of [row.control, row.owasp, row.tests, row.command, row.result, row.audit, row.rollback]) {
        expect(field.length, row.id).toBeGreaterThan(0);
      }
      // El rollback es el que declara cada commit (p. ej. RB-FORWARD-FIX en la migración de G05-C11).
      expect(row.rollback, row.id).toMatch(/^RB-[A-Z-]+/);
    }
  });

  it('los gates indexados tienen sección y filas', () => {
    for (const gate of INDEXED_GATES) {
      expect(index, gate).toMatch(new RegExp(`^## ${gate} — `, 'm'));
      expect(rows.some((row) => row.id.startsWith(`${gate}-`)), gate).toBe(true);
    }
  });

  it('las filas PASS citan un resultado verde y ninguna depende de producción o de corridas remotas', () => {
    for (const row of rows) {
      if (row.state === 'PASS') {
        expect(row.result, row.id).toMatch(/^PASS/);
      }
      expect(`${row.tests} ${row.command} ${row.result}`, row.id).not.toMatch(/producci[oó]n|\bVM\b|run id|workflow remoto|post-deploy/i);
    }
  });

  it('cada test citado existe en el repositorio', () => {
    expect(citedSpecs(index).filter((name) => !specExists(name))).toEqual([]);
  });

  it('las operaciones no ejecutadas figuran como handoff, sin SHA ni tests', () => {
    const handoff = rows.filter((row) => row.state === 'OUT_OF_SCOPE_ADMIN_HANDOFF');
    expect(handoff.map((row) => row.id)).toEqual(NOT_EXECUTED);
    for (const row of handoff) {
      expect(row.sha, row.id).toBe('—');
      expect(row.result, row.id).toBe('—');
    }
  });

  it('solo la fila de G08 en curso puede no tener SHA todavía', () => {
    const pending = rows.filter((row) => row.state !== 'OUT_OF_SCOPE_ADMIN_HANDOFF' && !/^[0-9a-f]{8}$/.test(row.sha));
    expect(pending.length).toBeLessThanOrEqual(1);
    for (const row of pending) {
      expect(row.id).toMatch(/^G08-/);
      expect(row.sha).toBe('este commit');
    }
  });

  it.runIf(gitAvailable())('cada SHA del índice es el del commit con ese ID en el historial local', () => {
    const history = historyCommitIds();
    for (const row of rows.filter((entry) => /^[0-9a-f]{8}$/.test(entry.sha))) {
      expect(history.get(row.id)?.slice(0, 8), row.id).toBe(row.sha);
    }
  });

  it.runIf(gitAvailable())('todo commit trazable de los gates indexados tiene fila (el commit actual de G08 puede ir como «este commit»)', () => {
    const history = historyCommitIds();
    const headId = TRACE.exec(git('show', '-s', '--format=%B', 'HEAD'))?.[2];
    const indexed = new Map(rows.map((row) => [row.id, row]));
    const missing = [...history.keys()].filter((id) => INDEXED_GATES.includes(id.slice(0, 3)) && !indexed.has(id) && id !== headId);
    expect(missing).toEqual([]);
    // «este commit» solo puede ser el commit de G08 en curso: o aún no existe, o es HEAD.
    const pending = rows.find((row) => row.sha === 'este commit');
    if (pending && history.has(pending.id)) {
      expect(pending.id).toBe(headId);
    }
  });

  it('G01 y G02 quedan anclados como baseline de código y HU-159 con su clasificación factual', () => {
    const baseline = tableRows(index, 'Baseline de código G01/G02');
    expect(baseline.map((row) => [row[0], row[1]])).toEqual([
      ['G01', 'PASS'],
      ['G02', 'PASS_SCOPE_V2'],
    ]);
    expect(baseline[1][3]).toMatch(/G02-C03 NO fue ejecutada/);
    expect(index).toMatch(/^## HU-159 \(E2E\) — PREEXISTING_HU159_E2E_FAILURE$/m);
  });

  it.runIf(gitAvailable())('los conteos de G01/G02 salen del historial y G02-C03 no existe como commit', () => {
    const history = historyCommitIds();
    const baseline = tableRows(index, 'Baseline de código G01/G02');
    for (const [gate, , count] of baseline) {
      expect(Number(count), gate).toBe([...history.keys()].filter((id) => id.startsWith(`${gate}-`)).length);
    }
    expect(Number(baseline[0][2])).toBe(12);
    expect(Number(baseline[1][2])).toBe(17);
    for (const id of NOT_EXECUTED) {
      expect(history.has(id), id).toBe(false);
    }
  });
});
