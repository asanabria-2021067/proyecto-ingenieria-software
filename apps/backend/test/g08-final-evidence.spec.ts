import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
import { PHASE2_BASE, git, gitAvailable, historyCommitIds, tableRows } from './helpers/owasp-evidence';
import { runVerifier } from './helpers/owasp-delta-fixture';

/**
 * G08-C10 · OWASP25-C048 (A01–A10). Cierre de la workstream: la línea base, el
 * conteo por gate y el total salen del historial local; el delta está aislado
 * (OWASP_DELTA_ISOLATED=PASS); toda la fase tiene un único autor/committer y
 * ningún trailer de herramientas; el paquete del PR único hacia develop está
 * listo sin declarar push, merge ni acciones administrativas.
 */

const doc = readRepoFile('docs/security/owasp-final-evidence.md');
const GATE_START = '7a9ebc4eb1becd3485fe65c94ba7411dd56c4c70';

describe('G08-C10: evidencia final y handoff', () => {
  it('registra la base de la fase, la de G08 y el rango completo', () => {
    expect(doc).toContain(PHASE2_BASE);
    expect(doc).toContain(GATE_START);
    expect(doc).toMatch(/\*\*99\*\* commits/);
  });

  it('el conteo por gate suma el total y G02 declara C03 como no ejecutada', () => {
    const rows = tableRows(doc, 'Commits por gate');
    const gates = rows.filter((row) => /^G0\d$/.test(row[0]));
    expect(gates.map((row) => row[0])).toEqual(['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07', 'G08']);
    const total = gates.reduce((sum, row) => sum + Number(row[1]), 0);
    expect(total).toBe(99);
    expect(rows.find((row) => row[0] === '**Total**')?.[1]).toBe('**99**');
    expect(gates.find((row) => row[0] === 'G02')?.[2]).toMatch(/^PASS_SCOPE_V2 \(G02-C03 no ejecutada/);
    for (const row of gates.filter((entry) => entry[0] !== 'G02')) {
      expect(row[2], row[0]).toBe('PASS');
    }
  });

  it.runIf(gitAvailable())('los conteos de G01–G07 coinciden con el historial y G08 no supera sus 10 commits', () => {
    const history = [...historyCommitIds().keys()];
    const rows = tableRows(doc, 'Commits por gate').filter((row) => /^G0\d$/.test(row[0]));
    for (const [gate, count] of rows) {
      const inHistory = history.filter((id) => id.startsWith(`${gate}-`)).length;
      if (gate === 'G08') {
        expect(inHistory).toBeLessThanOrEqual(Number(count));
        expect(inHistory).toBeGreaterThanOrEqual(Number(count) - 1);
      } else {
        expect(inHistory, gate).toBe(Number(count));
      }
    }
    const total = Number(git('rev-list', '--count', `${PHASE2_BASE}..HEAD`));
    expect([98, 99]).toContain(total);
    expect(Number(git('rev-list', '--merges', '--count', `${PHASE2_BASE}..HEAD`))).toBe(0);
  });

  it.runIf(gitAvailable())('toda la fase tiene un único autor/committer y ningún trailer de herramientas o coautoría', () => {
    const identities = new Set(git('log', '--format=%an <%ae>|%cn <%ce>', `${PHASE2_BASE}..HEAD`).split('\n'));
    expect(identities.size).toBe(1);
    const [author, committer] = [...identities][0].split('|');
    expect(author).toBe(committer);
    expect(author.startsWith('Junjey123-mx ')).toBe(true);
    const bodies = git('log', '--format=%B', `${PHASE2_BASE}..HEAD`);
    expect(bodies).not.toMatch(/co-authored-by|signed-off-by|claude|anthropic|generated-by|ai-assisted/i);
  });

  it.runIf(gitAvailable())('no hay rutas sensibles versionadas en la fase (la plantilla .env.example es legítima)', () => {
    const files = git('log', '--name-only', '--format=', `${PHASE2_BASE}..HEAD`).split('\n').filter(Boolean);
    const sensitive = files.filter((file) => /^(\.claude|\.codex|\.env|backups?\/)|\.(dump|pem|key)$/.test(file) && file !== '.env.example');
    expect(sensitive).toEqual([]);
  });

  it.runIf(gitAvailable())('OWASP_DELTA_ISOLATED = PASS con el verificador real', () => {
    const result = runVerifier([]);
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(/^OWASP_DELTA_ISOLATED=PASS base=0a723a8d93b6 /);
  });

  it('el paquete del PR único no declara push, merge ni acciones administrativas como hechas', () => {
    const rows = Object.fromEntries(tableRows(doc, 'Paquete del PR único').map(([field, value]) => [field.replace(/`/g, ''), value]));
    expect(rows.UNIQUE_PR_TARGET).toBe('`sprint8/vernel-owasp2025 → develop`');
    expect(rows.EXISTING_PR_REFERENCE).toMatch(/^#231, if still active/);
    expect(rows.REMOTE_STATUS).toMatch(/^NOT_VERIFIED_IN_G08/);
    expect(rows.PUSH).toMatch(/^NOT_PERFORMED/);
    for (const pending of ['Push de la rama', 'Actualizar el PR único', 'Checks remotos del PR', 'Sincronización con `develop`']) {
      expect(doc, pending).toMatch(new RegExp(`- \\[ \\] ${pending.replace(/[`]/g, '.')}`));
    }
    expect(doc).toMatch(/VERNEL_CODE_SCOPE\s+= CLOSED/);
    expect(doc).toMatch(/REMOTE_HANDOFF\s+= PENDING_OWNER_AUTHORIZATION/);
  });
});
