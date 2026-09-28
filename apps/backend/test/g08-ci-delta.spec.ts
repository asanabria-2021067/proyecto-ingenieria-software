import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateExpression } from './helpers/gha-expression';
import { loadWorkflow, type WorkflowStep } from './helpers/workflow-yaml';
import { createFixtureRepo, runVerifier, traceMessage, type FixtureRepo } from './helpers/owasp-delta-fixture';

/**
 * G08-C04 · OWASP25-C048 (A08:2025). El job OWASP_DELTA_ISOLATED de `ci.yml`
 * corre el verificador local del delta en el PR de la rama OWASP hacia
 * develop, con historial completo, solo lectura y sin secretos, deploy ni
 * ruta hacia main. La ejecución remota del PR es evidencia adicional; el
 * contrato se prueba aquí de forma estática y con un repositorio sintético.
 */

const OWASP_BRANCH = 'sprint8/vernel-owasp2025';
const ci = loadWorkflow('ci.yml');
const job = ci.jobs['owasp-delta'] as (typeof ci.jobs)[string] & { 'runs-on'?: string; 'continue-on-error'?: unknown };
const steps = (job?.steps ?? []) as Array<WorkflowStep & { with?: Record<string, unknown> }>;
const verifyStep = () => steps.find((step) => step.run?.includes('scripts/security/verify-owasp-delta.mjs'));

const runs = (event: string, baseRef: string, headRef: string, inputs: Record<string, string> = {}) =>
  evaluateExpression(job.if ?? 'false', { github: { event_name: event, base_ref: baseRef, head_ref: headRef }, inputs });

describe('G08-C04: OWASP_DELTA_ISOLATED en CI', () => {
  it('el job existe con el nombre estable del check', () => {
    expect(job).toBeDefined();
    expect(job.name).toBe('OWASP_DELTA_ISOLATED');
  });

  it.each([
    ['PR de la rama OWASP hacia develop', 'pull_request', 'develop', OWASP_BRANCH, {}, true],
    ['PR de la rama OWASP hacia main', 'pull_request', 'main', OWASP_BRANCH, {}, false],
    ['PR de otra rama hacia develop', 'pull_request', 'develop', 'feature/otra-cosa', {}, false],
    ['push a develop', 'push', '', '', {}, false],
    ['workflow_call del deploy', 'push', '', '', { e2e: 'run' }, false],
    ['workflow_dispatch', 'workflow_dispatch', '', '', {}, false],
  ])('%s → %s', (_caso, event, baseRef, headRef, inputs, expected) => {
    expect(runs(event, baseRef, headRef, inputs)).toBe(expected);
  });

  it('permisos mínimos de solo lectura, sin secretos ni continue-on-error', () => {
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(job['continue-on-error']).toBeUndefined();
    expect(JSON.stringify(job)).not.toMatch(/secrets\.|GITHUB_TOKEN|packages|id-token/);
  });

  it('checkout con historial completo del head del PR y sin credenciales persistidas', () => {
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toMatchObject({ 'fetch-depth': 0, ref: '${{ github.event.pull_request.head.sha }}', 'persist-credentials': false });
  });

  it('ejecuta el verificador contra el merge-base con la rama destino, sin interpolar en el script', () => {
    const step = verifyStep();
    expect(step?.run?.trim()).toBe('node scripts/security/verify-owasp-delta.mjs --base-ref "$BASE_REF"');
    expect(step?.env).toEqual({ BASE_REF: 'origin/${{ github.base_ref }}' });
  });

  it('no despliega, no publica imágenes ni toca main', () => {
    const source = JSON.stringify(steps);
    expect(source).not.toMatch(/docker|ssh|deploy|push|ghcr|refs\/heads\/main|npm (ci|install)/i);
  });

  describe('fixture de delta inválido con el mismo comando', () => {
    let repo: FixtureRepo | null = null;

    afterEach(() => {
      repo?.cleanup();
      repo = null;
    });

    it('un PR con una ruta ajena hace fallar el check (exit 1)', () => {
      repo = createFixtureRepo();
      const base = repo.commit('chore: base', { 'README.md': 'base\n' });
      repo.git('branch', 'develop', base);
      const allowlistPath = join(repo.dir, 'allowlist.json');
      writeFileSync(
        allowlistPath,
        JSON.stringify({
          version: 1,
          baseSha: base,
          branch: OWASP_BRANCH,
          gates: ['G08'],
          notExecuted: [],
          paths: [{ path: 'docs/security/nota.md', gates: ['G08'] }],
          patterns: [],
          exceptions: [],
        }),
      );
      repo.commit(traceMessage('G08-C01'), { 'docs/security/nota.md': '# nota\n' });
      const valid = runVerifier(['--repo', repo.dir, '--allowlist', allowlistPath, '--base-ref', 'develop']);
      expect(valid.status, valid.stdout).toBe(0);

      repo.commit(traceMessage('G08-C02'), { 'apps/backend/src/sprints/nuevo.service.ts': 'export {};\n' });
      const invalid = runVerifier(['--repo', repo.dir, '--allowlist', allowlistPath, '--base-ref', 'develop']);
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toContain('OWASP_DELTA_ISOLATED=FAIL');
      expect(invalid.stdout).toContain('ruta-fuera-de-allowlist: apps/backend/src/sprints/nuevo.service.ts');
    });
  });
});
