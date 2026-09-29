import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './helpers/gha-expression';
import { loadWorkflow, parseWorkflow, readRepoFile, type WorkflowJob } from './helpers/workflow-yaml';
import { redact, summarizeAudit } from '../../../.github/scripts/npm-audit-summary.mjs';

/**
 * G03-C02 · OWASP25-C040. Resumen informativo de `npm audit --omit=dev` por
 * app: visible en cada corrida, nunca bloqueante y sin tokens ni credenciales
 * de registry en el log.
 */

const SCRIPT = '.github/scripts/npm-audit-summary.mjs';

export function auditJobLeakFindings(job: WorkflowJob): string[] {
  const findings: string[] = [];
  const source = JSON.stringify(job);
  if (/secrets\.|github\.token/i.test(source)) {
    findings.push('usa-secretos');
  }
  if (/NODE_AUTH_TOKEN|NPM_TOKEN|_authToken|registry-url/i.test(source)) {
    findings.push('credenciales-de-registry');
  }
  if (JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })) {
    findings.push('permisos-no-minimos');
  }
  if ((job.steps ?? []).some((step) => /\bnpm (ci|install)\b|audit fix/.test(step.run ?? ''))) {
    findings.push('instala-o-modifica-dependencias');
  }
  return findings;
}

const ci = loadWorkflow('ci.yml');
const job = ci.jobs['dependency-audit'];

const report = {
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 1, total: 3 } },
  vulnerabilities: {
    'pkg-mod': { name: 'pkg-mod', severity: 'moderate', isDirect: false, fixAvailable: true, via: ['pkg-crit'] },
    'pkg-crit': {
      name: 'pkg-crit',
      severity: 'critical',
      isDirect: true,
      fixAvailable: { name: 'pkg-crit', version: '4.0.0', isSemVerMajor: true },
      via: [{ url: 'https://github.com/advisories/GHSA-abcd-efgh-ijkl', title: 'token npm_' + 'a'.repeat(36) }],
    },
    'pkg-high': {
      name: 'pkg-high',
      severity: 'high',
      isDirect: false,
      fixAvailable: false,
      via: [{ url: 'https://user:s3cr3t@registry.example.com/advisories/GHSA-1111-2222-3333' }],
    },
  },
};

describe('G03-C02: resumen informativo de npm audit', () => {
  it('el job audita ambas apps solo en producción con el script de resumen', () => {
    const step = (job.steps ?? []).find((s) => s.run?.includes(SCRIPT));
    expect(step?.run).toBe(`node ${SCRIPT} apps/backend apps/frontend`);
    expect(readRepoFile(SCRIPT)).toContain("['audit', '--omit=dev', '--json']");
    expect(readRepoFile(SCRIPT)).not.toContain('--force');
  });

  it('el job no expone tokens ni credenciales de registry y no instala dependencias', () => {
    expect(auditJobLeakFindings(job)).toEqual([]);
  });

  it('es informativo: sin continue-on-error y el script no falla por vulnerabilidades', () => {
    expect((job as { 'continue-on-error'?: unknown })['continue-on-error']).toBeUndefined();
    expect(readRepoFile(SCRIPT)).not.toMatch(/process\.exit(Code)?\s*[(=]\s*[1-9]/);
  });

  it.each<[string, string, Record<string, string>, boolean]>([
    ['pull_request', 'pull_request', {}, true],
    ['push a develop', 'push', {}, true],
    ['workflow_dispatch', 'workflow_dispatch', {}, true],
    ['workflow_call del deploy', 'push', { e2e: 'run' }, false],
  ])('%s → %s', (_caso, event, inputs, expected) => {
    expect(evaluateExpression(job.if ?? 'false', { github: { event_name: event }, inputs })).toBe(expected);
  });

  it('el resumen ordena por severidad, marca fixes major y lista los GHSA', () => {
    const summary = summarizeAudit('apps/backend', report) as string;
    expect(summary).toContain('| 1 | 1 | 1 | 0 | 0 | 3 |');
    const rows = summary.split('\n').filter((line) => line.startsWith('| pkg-'));
    expect(rows).toEqual([
      '| pkg-crit | critical | sí | major (pkg-crit@4.0.0) | GHSA-abcd-efgh-ijkl |',
      '| pkg-high | high | no | no | GHSA-1111-2222-3333 |',
      '| pkg-mod | moderate | no | sí | — |',
    ]);
  });

  it('sin JSON legible reporta "no disponible" en lugar de fallar', () => {
    expect(summarizeAudit('apps/frontend', null)).toContain('Reporte no disponible');
  });

  describe('fixtures negativos de saneamiento', () => {
    it.each([
      ['token npm', `x npm_${'a'.repeat(36)} y`],
      ['token GitHub', `ghp_${'b'.repeat(36)}`],
      ['credencial en URL', 'https://user:s3cr3t@registry.example.com/pkg'],
      ['línea de .npmrc', '//registry.npmjs.org/:_authToken=abc123'],
      ['bearer', 'Authorization: Bearer abc.def.ghi'],
    ])('%s se redacta', (_caso, text) => {
      const output = redact(text) as string;
      expect(output).toContain('[REDACTED]');
      expect(output).not.toMatch(/a{36}|b{36}|s3cr3t|abc123|abc\.def\.ghi/);
    });

    it('un job con token de registry o npm ci queda señalado', () => {
      const leaky = parseWorkflow(
        `on: push\njobs:\n  dependency-audit:\n    runs-on: x\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          registry-url: https://npm.pkg.github.com\n      - run: npm ci && npm audit\n        env:\n          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n`,
      ).jobs['dependency-audit'];
      expect(auditJobLeakFindings(leaky)).toEqual([
        'usa-secretos',
        'credenciales-de-registry',
        'permisos-no-minimos',
        'instala-o-modifica-dependencias',
      ]);
    });
  });
});
