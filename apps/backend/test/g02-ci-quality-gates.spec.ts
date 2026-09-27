import { describe, expect, it } from 'vitest';
import { findStep, loadWorkflow, parseWorkflow, readRepoFile, type Workflow, type WorkflowJob } from './helpers/workflow-yaml';

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

/**
 * Gates que deben correr en todo evento (PR, push, dispatch y workflow_call):
 * cada comando exigido debe existir en el job y no estar condicionado.
 */
export function unconditionalGateFindings(job: WorkflowJob, commands: string[]): string[] {
  const findings: string[] = [];
  for (const command of commands) {
    const steps = (job.steps ?? []).filter((step) => step.run?.trim() === command);
    if (steps.length === 0) {
      findings.push(`gate-ausente:${command}`);
    } else if (steps.every((step) => (step as { if?: string }).if !== undefined)) {
      findings.push(`gate-condicionado:${command}`);
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

describe('G02-C10: typecheck explícito del frontend', () => {
  it('package.json define typecheck con tsc --noEmit', () => {
    const scripts = (JSON.parse(readRepoFile('apps/frontend/package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.typecheck).toBe('tsc --noEmit');
  });

  it('el job frontend ejecuta typecheck en todo evento', () => {
    expect(unconditionalGateFindings(ci.jobs.frontend, ['npm run lint', 'npm run typecheck'])).toEqual([]);
  });

  it('fixture: un typecheck limitado a PR o ausente se detecta', () => {
    const job = parseWorkflow(
      "on: push\njobs:\n  frontend:\n    runs-on: x\n    steps:\n      - run: npm run typecheck\n        if: github.event_name == 'pull_request'\n",
    ).jobs.frontend;
    expect(unconditionalGateFindings(job, ['npm run typecheck', 'npm run build'])).toEqual([
      'gate-condicionado:npm run typecheck',
      'gate-ausente:npm run build',
    ]);
  });
});

/** Un build de CI solo recibe configuración sintética: sin secretos ni hosts productivos. */
export function syntheticBuildEnvFindings(env: Record<string, string> | undefined): string[] {
  return Object.entries(env ?? {})
    .filter(([, value]) => /secrets\.|vars\.|158\.23\.57\.118|nip\.io/.test(String(value)))
    .map(([name]) => `env-no-sintetico:${name}`);
}

describe('G02-C11: next build en todo evento', () => {
  const build = () => findStep(ci.jobs.frontend, (step) => step.run === 'npm run build');

  it('el job frontend construye en todo evento', () => {
    expect(unconditionalGateFindings(ci.jobs.frontend, ['npm run typecheck', 'npm run build'])).toEqual([]);
  });

  it('el build usa solo configuración pública sintética', () => {
    expect(syntheticBuildEnvFindings(build().env)).toEqual([]);
    expect(build().env?.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001');
  });

  it('fixture: un build alimentado con secretos o la URL productiva se detecta', () => {
    expect(
      syntheticBuildEnvFindings({
        NEXT_PUBLIC_API_URL: 'http://158.23.57.118:3001',
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: '${{ secrets.CLOUDINARY_CLOUD_NAME }}',
        NEXT_TELEMETRY_DISABLED: '1',
      }),
    ).toEqual(['env-no-sintetico:NEXT_PUBLIC_API_URL', 'env-no-sintetico:NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME']);
  });
});
