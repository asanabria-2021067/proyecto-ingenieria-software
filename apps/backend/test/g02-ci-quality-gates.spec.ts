import { describe, expect, it } from 'vitest';
import { findStep, loadWorkflow, parseWorkflow, type Workflow } from './helpers/workflow-yaml';

/**
 * G02 · OWASP25-C031/C032/C043. Contrato de los gates de calidad de ci.yml:
 * lint bloqueante, nombres de job estables para branch protection y (según
 * avanzan los commits del gate) typecheck, build y tests del frontend en todo
 * evento. Los fixtures demuestran que el guard detecta un gate silenciado.
 */

/** Nombres que los rulesets usarán como checks requeridos: no deben cambiar. */
export const STABLE_JOB_NAMES: Record<string, string> = {
  backend: 'Backend - lint y pruebas',
  frontend: 'Frontend - lint y pruebas',
  e2e: 'E2E - suite de humo (Playwright)',
};

/** Pasos o jobs cuyo fallo se convertiría en éxito. */
export function silencedGateFindings(workflow: Workflow): string[] {
  const findings: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if ((job as { 'continue-on-error'?: unknown })['continue-on-error'] !== undefined) {
      findings.push(`job-continue-on-error:${id}`);
    }
    for (const step of job.steps ?? []) {
      if ((step as { 'continue-on-error'?: unknown })['continue-on-error'] !== undefined) {
        findings.push(`step-continue-on-error:${id}:${step.name ?? step.run}`);
      }
      if (/\|\|\s*(true|exit 0|:)\s*$/m.test(step.run ?? '') && /lint|test|build|tsc/.test(step.run ?? '')) {
        findings.push(`fallo-silenciado:${id}:${step.name ?? step.run}`);
      }
    }
  }
  return findings;
}

const ci = loadWorkflow('ci.yml');

describe('G02-C09: lint bloqueante en CI', () => {
  it('ningún gate de ci.yml convierte un fallo en éxito', () => {
    expect(silencedGateFindings(ci)).toEqual([]);
  });

  it.each(['backend', 'frontend'])('el job %s ejecuta el lint real del paquete', (id) => {
    expect(findStep(ci.jobs[id], (step) => step.name === 'Lint').run).toBe('npm run lint');
  });

  it('los nombres de job usados por branch protection no cambian', () => {
    for (const [id, name] of Object.entries(STABLE_JOB_NAMES)) {
      expect(ci.jobs[id]?.name).toBe(name);
    }
  });

  describe('fixtures negativos', () => {
    const fixture = (steps: string) =>
      parseWorkflow(`on: push\njobs:\n  frontend:\n    runs-on: x\n    steps:\n${steps}`);

    it('continue-on-error en el paso de lint', () => {
      expect(
        silencedGateFindings(fixture('      - name: Lint\n        run: npm run lint\n        continue-on-error: true\n')),
      ).toEqual(['step-continue-on-error:frontend:Lint']);
    });

    it('un lint con || true', () => {
      expect(silencedGateFindings(fixture('      - name: Lint\n        run: npm run lint || true\n'))).toEqual([
        'fallo-silenciado:frontend:Lint',
      ]);
    });
  });
});
