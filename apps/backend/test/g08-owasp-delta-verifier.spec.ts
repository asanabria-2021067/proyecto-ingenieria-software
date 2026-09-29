import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Script sin dependencias (scripts/security), el mismo que corre el job OWASP_DELTA_ISOLATED.
import { allowedGates, globToRegExp, parseAllowlist, verifyDelta } from '../../../scripts/security/verify-owasp-delta.mjs';
import { createFixtureRepo, runVerifier, traceMessage, type FixtureRepo } from './helpers/owasp-delta-fixture';
import { gitAvailable } from './helpers/owasp-evidence';

/**
 * G08-C03 · OWASP25-C048 (A08:2025). Verificador determinista y solo local del
 * delta OWASP: rechaza rutas fuera de la allowlist o de otro gate y commits
 * sin la trazabilidad real de la workstream. Fixtures negativas con
 * repositorios Git sintéticos; la corrida sobre el repositorio real pasa.
 */

const BASE_ALLOWLIST = {
  version: 1,
  baseSha: 'a'.repeat(40),
  branch: 'fixture',
  gates: ['G01', 'G08'],
  notExecuted: [{ id: 'G01-C03', status: 'OUT_OF_SCOPE_ADMIN_HANDOFF', reason: 'fixture' }],
  paths: [
    { path: 'apps/backend/src/config/jwt-secret.ts', gates: ['G01'] },
    { path: 'docs/security/nota.md', gates: ['G08'] },
  ],
  patterns: [{ glob: 'apps/backend/test/g08-*.spec.ts', gates: ['G08'], reason: 'tests de G08' }],
  exceptions: [],
};
const allowlist = parseAllowlist(JSON.stringify(BASE_ALLOWLIST));
const commit = (id: string | null, files: string[], extra: Partial<{ merge: boolean; short: string }> = {}) => ({
  short: extra.short ?? 'abcd1234',
  merge: extra.merge ?? false,
  message: id ? traceMessage(id) : 'feat: cambio sin trazabilidad',
  files,
});

describe('G08-C03: núcleo del verificador', () => {
  it.each([
    ['JSON inválido', '{', 'JSON invalido'],
    ['versión', JSON.stringify({ ...BASE_ALLOWLIST, version: 2 }), 'version'],
    ['base incompleta', JSON.stringify({ ...BASE_ALLOWLIST, baseSha: 'abc' }), 'baseSha'],
    ['gate desconocido', JSON.stringify({ ...BASE_ALLOWLIST, paths: [{ path: 'x.ts', gates: ['G09'] }] }), 'gates invalidos'],
    ['ruta duplicada', JSON.stringify({ ...BASE_ALLOWLIST, paths: [BASE_ALLOWLIST.paths[0], BASE_ALLOWLIST.paths[0]] }), 'duplicada'],
    ['ruta absoluta', JSON.stringify({ ...BASE_ALLOWLIST, paths: [{ path: '/etc/x', gates: ['G01'] }] }), 'ruta invalida'],
    ['ruta con ..', JSON.stringify({ ...BASE_ALLOWLIST, paths: [{ path: 'a/../b', gates: ['G01'] }] }), 'ruta invalida'],
    ['patrón demasiado amplio', JSON.stringify({ ...BASE_ALLOWLIST, patterns: [{ glob: '**', gates: ['G08'], reason: 'todo' }] }), 'amplio'],
    ['patrón sin justificación', JSON.stringify({ ...BASE_ALLOWLIST, patterns: [{ glob: 'a/*.ts', gates: ['G08'] }] }), 'justificacion'],
  ])('allowlist inválida (%s) se rechaza', (_caso, text, message) => {
    expect(() => parseAllowlist(text)).toThrow(message);
  });

  it('el glob mínimo distingue * de **', () => {
    expect(globToRegExp('apps/backend/test/g08-*.spec.ts').test('apps/backend/test/g08-x.spec.ts')).toBe(true);
    expect(globToRegExp('apps/backend/test/g08-*.spec.ts').test('apps/backend/test/sub/g08-x.spec.ts')).toBe(false);
    expect(globToRegExp('infra/**').test('infra/a/b/c.conf')).toBe(true);
    expect([...allowedGates(allowlist, 'apps/backend/test/g08-uno.spec.ts')]).toEqual(['G08']);
  });

  it('fixture válida → sin hallazgos', () => {
    const commits = [commit('G01-C01', ['apps/backend/src/config/jwt-secret.ts']), commit('G08-C01', ['docs/security/nota.md', 'apps/backend/test/g08-uno.spec.ts'], { short: 'ef567890' })];
    expect(verifyDelta({ allowlist, commits, deltaPaths: ['apps/backend/src/config/jwt-secret.ts', 'docs/security/nota.md'] })).toEqual([]);
  });

  it.each([
    ['ruta fuera de la allowlist', [commit('G01-C01', ['apps/frontend/app/nueva/page.tsx'])], [], 'ruta-fuera-de-allowlist: apps/frontend/app/nueva/page.tsx (abcd1234)'],
    ['ruta de otro gate', [commit('G01-C01', ['docs/security/nota.md'])], [], 'ruta-de-otro-gate: docs/security/nota.md (abcd1234 G01)'],
    ['commit sin trazabilidad', [commit(null, ['docs/security/nota.md'])], [], 'sin-trazabilidad: abcd1234'],
    ['ID declarado como no ejecutado', [commit('G01-C03', ['apps/backend/src/config/jwt-secret.ts'])], [], 'id-marcado-como-no-ejecutado: abcd1234 G01-C03'],
    ['ID duplicado', [commit('G01-C01', []), commit('G01-C01', [], { short: 'ffff0000' })], [], 'id-duplicado: G01-C01 (abcd1234 y ffff0000)'],
    ['ruta del delta agregado fuera de la allowlist', [], ['apps/backend/src/sprints/sprints.service.ts'], 'ruta-fuera-de-allowlist: apps/backend/src/sprints/sprints.service.ts (delta)'],
  ])('fixture negativa: %s', (_caso, commits, deltaPaths, finding) => {
    expect(verifyDelta({ allowlist, commits, deltaPaths })).toContain(finding);
  });

  it('un gate que no coincide con su ID se detecta', () => {
    const message = traceMessage('G01-C01').replace('Gate G01', 'Gate G08');
    expect(verifyDelta({ allowlist, commits: [{ short: 'abcd1234', merge: false, message, files: [] }], deltaPaths: [] })).toContain(
      'gate-inconsistente: abcd1234 G08/G01-C01',
    );
  });

  it('los merges no se exigen trazables (su contenido lo cubre el delta agregado)', () => {
    expect(verifyDelta({ allowlist, commits: [commit(null, [], { merge: true })], deltaPaths: [] })).toEqual([]);
  });
});

describe('G08-C03: verificador sobre repositorios Git sintéticos', () => {
  let repo: FixtureRepo | null = null;

  afterEach(() => {
    repo?.cleanup();
    repo = null;
  });

  function setup() {
    repo = createFixtureRepo();
    const base = repo.commit('chore: base', { 'README.md': 'base\n' });
    const allowlistPath = join(repo.dir, 'allowlist.json');
    writeFileSync(allowlistPath, JSON.stringify({ ...BASE_ALLOWLIST, baseSha: base }));
    repo.commit(traceMessage('G01-C01'), { 'apps/backend/src/config/jwt-secret.ts': 'export {};\n' });
    repo.commit(traceMessage('G08-C01'), { 'docs/security/nota.md': '# nota\n' });
    return { base, allowlistPath, fixture: repo };
  }

  it('delta aislado y trazable → PASS (exit 0)', () => {
    const { allowlistPath, fixture } = setup();
    const result = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath]);
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(/^OWASP_DELTA_ISOLATED=PASS base=[0-9a-f]{12} head=[0-9a-f]{12} commits=2 merges=0 paths=2/);
  });

  it('una funcionalidad ajena en el rango → FAIL (exit 1) con la ruta', () => {
    const { allowlistPath, fixture } = setup();
    fixture.commit(traceMessage('G08-C02'), { 'apps/frontend/app/nueva/page.tsx': 'export default 1;\n' });
    const result = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('ruta-fuera-de-allowlist: apps/frontend/app/nueva/page.tsx');
  });

  it('un commit sin trazabilidad → FAIL', () => {
    const { allowlistPath, fixture } = setup();
    fixture.commit('fix: cambio rapido', { 'docs/security/nota.md': '# nota 2\n' });
    const result = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/sin-trazabilidad: [0-9a-f]{8}/);
  });

  it('una base inexistente o una allowlist ilegible → FAIL sin hallazgos inventados', () => {
    const { allowlistPath, fixture } = setup();
    const missingBase = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath, '--base', 'b'.repeat(40)]);
    expect(missingBase.status).toBe(1);
    expect(missingBase.stdout).toContain('no existe en el historial local');
    writeFileSync(allowlistPath, '{roto');
    const broken = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath]);
    expect(broken.status).toBe(1);
    expect(broken.stdout).toContain('allowlist: JSON invalido');
  });

  it('--base-ref usa el merge-base con la rama destino (flujo del PR)', () => {
    const { allowlistPath, fixture } = setup();
    fixture.git('branch', 'develop', 'HEAD~2');
    const result = runVerifier(['--repo', fixture.dir, '--allowlist', allowlistPath, '--base-ref', 'develop']);
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toContain('commits=2');
  });
});

describe('G08-C03: repositorio real', () => {
  it.runIf(gitAvailable())('el delta de la rama OWASP está aislado y es trazable', () => {
    const result = runVerifier([]);
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(/^OWASP_DELTA_ISOLATED=PASS base=0a723a8d93b6 /);
  });
});
