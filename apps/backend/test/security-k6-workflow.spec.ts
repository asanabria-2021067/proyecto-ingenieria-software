import { describe, expect, it } from 'vitest';
import { loadWorkflow, parseWorkflow, readRepoFile, type Workflow } from './helpers/workflow-yaml';

/**
 * k6.yml corre contra produccion con credenciales de la VM: solo desde main,
 * dentro del environment `production`, con GITHUB_TOKEN de solo lectura, con
 * las URLs de base de datos unicamente en los pasos `npm run k6:*` y sin
 * interpolar secretos dentro del script del shell.
 */

const MAIN_GUARD = "github.ref == 'refs/heads/main'";
const DB_VARS = ['DATABASE_URL', 'DIRECT_URL'];

export function k6WorkflowFindings(workflow: Workflow): string[] {
  const findings: string[] = [];
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) {
    findings.push('permisos-no-minimos');
  }
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if ((job.if ?? '').trim() !== MAIN_GUARD) {
      findings.push(`sin-guarda-main:${id}`);
    }
    if (job.environment !== 'production') {
      findings.push(`sin-environment-production:${id}`);
    }
    for (const name of DB_VARS) {
      if (job.env && name in job.env) {
        findings.push(`${name}-en-job:${id}`);
      }
    }
    for (const step of job.steps ?? []) {
      const runsK6 = /npm run k6:/.test(step.run ?? '');
      for (const name of DB_VARS) {
        if (step.env && name in step.env && !runsK6) {
          findings.push(`${name}-fuera-de-k6:${step.name}`);
        }
        if (runsK6 && !(step.env && name in step.env)) {
          findings.push(`${name}-ausente:${step.name}`);
        }
      }
      if ((step.run ?? '').includes('${{')) {
        findings.push(`run-interpola:${step.name}`);
      }
    }
  }
  return findings;
}

describe('k6.yml: permisos, ref, environment y secretos', () => {
  const source = readRepoFile('.github/workflows/k6.yml');

  it('cumple el contrato', () => {
    expect(k6WorkflowFindings(loadWorkflow('k6.yml'))).toEqual([]);
  });

  it('la clave SSH y known_hosts se escriben con printf desde env, con verificacion estricta del host', () => {
    expect(source).toContain(`printf '%s\\n' "$SSH_KEY" > ~/.ssh/deploy_key`);
    expect(source).toContain(`printf '%s\\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts`);
    expect(source).toContain('StrictHostKeyChecking=yes');
    expect(source).not.toContain('accept-new');
  });

  it('las acciones de terceros van fijadas por SHA completo', () => {
    expect(source).toMatch(/grafana\/setup-k6-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  });

  describe('fixtures negativos', () => {
    const fixture = (header: string, job: string) => parseWorkflow(`on: workflow_dispatch\n${header}jobs:\n  k6:\n${job}`);
    const ok = '    if: github.ref == \'refs/heads/main\'\n    environment: production\n    runs-on: x\n';

    it('sin permisos, sin guarda o sin environment', () => {
      expect(k6WorkflowFindings(fixture('', '    runs-on: x\n'))).toEqual([
        'permisos-no-minimos',
        'sin-guarda-main:k6',
        'sin-environment-production:k6',
      ]);
    });

    it('DATABASE_URL en el env del job o en un paso que no es k6', () => {
      const job = `${ok}    env:\n      DATABASE_URL: x\n    steps:\n      - name: otro\n        env:\n          DIRECT_URL: y\n        run: echo\n`;
      expect(k6WorkflowFindings(fixture('permissions:\n  contents: read\n', job))).toEqual([
        'DATABASE_URL-en-job:k6',
        'DIRECT_URL-fuera-de-k6:otro',
      ]);
    });

    it('un secreto interpolado en el script', () => {
      const job = `${ok}    steps:\n      - name: tunel\n        run: echo "\${{ secrets.SSH_PRIVATE_KEY }}"\n`;
      expect(k6WorkflowFindings(fixture('permissions:\n  contents: read\n', job))).toEqual(['run-interpola:tunel']);
    });
  });
});
