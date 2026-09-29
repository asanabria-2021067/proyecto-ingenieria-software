import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './helpers/gha-expression';
import { loadWorkflow, parseWorkflow, type WorkflowJob } from './helpers/workflow-yaml';

/**
 * G03-C01 · OWASP25-C041. Todo PR pasa por dependency-review con
 * `fail-on-severity: high`: bloquea dependencias NUEVAS o cambiadas con
 * vulnerabilidades high/critical, sin evaluar el backlog histórico (eso lo
 * reporta el audit informativo). La prueba remota con un PR negativo (NT04)
 * queda fuera de este gate (Gate Admin).
 */

const REVIEW_ACTION = 'actions/dependency-review-action@';
const SEVERITY_ORDER = ['low', 'moderate', 'high', 'critical'];

/**
 * Semántica documentada de `fail-on-severity`: la acción falla si alguna
 * dependencia introducida por el PR tiene una vulnerabilidad de severidad
 * igual o mayor a la configurada.
 */
export function wouldBlock(failOnSeverity: string, introducedSeverities: string[]): boolean {
  const threshold = SEVERITY_ORDER.indexOf(failOnSeverity);
  if (threshold < 0) {
    throw new Error(`fail-on-severity desconocido: ${failOnSeverity}`);
  }
  return introducedSeverities.some((severity) => SEVERITY_ORDER.indexOf(severity) >= threshold);
}

export function dependencyReviewFindings(job: WorkflowJob | undefined): string[] {
  if (!job) {
    return ['job-ausente'];
  }
  const findings: string[] = [];
  const step = (job.steps ?? []).find((s) => s.uses?.startsWith(REVIEW_ACTION));
  if (!step) {
    findings.push('sin-dependency-review-action');
  } else if (step.with?.['fail-on-severity'] !== 'high') {
    findings.push(`fail-on-severity=${step.with?.['fail-on-severity'] ?? 'ausente'}`);
  }
  if (JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })) {
    findings.push('permisos-no-minimos');
  }
  if ((job as { 'continue-on-error'?: unknown })['continue-on-error'] !== undefined) {
    findings.push('continue-on-error');
  }
  return findings;
}

const ci = loadWorkflow('ci.yml');
const job = ci.jobs['dependency-review'];
const runs = (event: string, baseRef = '', inputs: Record<string, string> = {}) =>
  evaluateExpression(job.if ?? 'false', { github: { event_name: event, base_ref: baseRef }, inputs });

describe('G03-C01: dependency-review bloqueante en PR', () => {
  it('el job existe con fail-on-severity high, permisos mínimos y sin continue-on-error', () => {
    expect(dependencyReviewFindings(job)).toEqual([]);
  });

  it.each<[string, string, string, Record<string, string>, boolean]>([
    ['PR hacia develop', 'pull_request', 'develop', {}, true],
    ['PR hacia main', 'pull_request', 'main', {}, true],
    ['push a develop', 'push', '', {}, false],
    ['workflow_dispatch', 'workflow_dispatch', '', {}, false],
    ['workflow_call del deploy', 'push', '', { e2e: 'run' }, false],
  ])('%s → %s', (_caso, event, baseRef, inputs, expected) => {
    expect(runs(event, baseRef, inputs)).toBe(expected);
  });

  it('con la configuración real, una dependencia nueva high o critical sería rechazada y una moderate no', () => {
    const severity = job.steps?.find((s) => s.uses?.startsWith(REVIEW_ACTION))?.with?.['fail-on-severity'] ?? '';
    expect(wouldBlock(severity, ['high'])).toBe(true);
    expect(wouldBlock(severity, ['critical'])).toBe(true);
    expect(wouldBlock(severity, ['moderate', 'low'])).toBe(false);
    expect(wouldBlock(severity, [])).toBe(false);
  });

  describe('fixtures negativos', () => {
    const fixture = (body: string) => parseWorkflow(`on: pull_request\njobs:\n  dependency-review:\n${body}`).jobs['dependency-review'];

    it('umbral debilitado a critical', () => {
      const weak = fixture(
        `    runs-on: x\n    permissions:\n      contents: read\n    steps:\n      - uses: ${REVIEW_ACTION}v4\n        with:\n          fail-on-severity: critical\n`,
      );
      expect(dependencyReviewFindings(weak)).toEqual(['fail-on-severity=critical']);
    });

    it('permisos de escritura o continue-on-error', () => {
      const loose = fixture(
        `    runs-on: x\n    continue-on-error: true\n    permissions:\n      contents: write\n    steps:\n      - uses: ${REVIEW_ACTION}v4\n        with:\n          fail-on-severity: high\n`,
      );
      expect(dependencyReviewFindings(loose)).toEqual(['permisos-no-minimos', 'continue-on-error']);
    });

    it('job ausente', () => {
      expect(dependencyReviewFindings(undefined)).toEqual(['job-ausente']);
    });
  });
});
