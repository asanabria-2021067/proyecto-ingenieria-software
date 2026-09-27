import { describe, expect, it } from 'vitest';
import { loadWorkflow, parseWorkflow, type Workflow } from './helpers/workflow-yaml';

/**
 * T23 · G02-C01 · OWASP25-C044/C045 + N-03. Ningún job de deploy.yml (tests,
 * build/push de imágenes y deploy a la VM) puede ejecutarse desde una ref
 * distinta de `refs/heads/main`, ni siquiera con workflow_dispatch desde una
 * rama de feature o de prueba negativa. Los fixtures demuestran que el guard
 * falla cuando la condición se quita o se debilita.
 */

const MAIN_GUARD = "github.ref == 'refs/heads/main'";

/** Jobs sin la guarda de main, o con una condición que permite eludirla. */
export function deployRefGuardFindings(workflow: Workflow): string[] {
  const findings: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const condition = (job.if ?? '').replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
    if (!condition.includes(MAIN_GUARD)) {
      findings.push(`sin-guarda:${id}`);
    } else if (condition.includes('||') || condition.includes('always()')) {
      findings.push(`guarda-eludible:${id}`);
    }
  }
  return findings;
}

const workflowWith = (jobs: string) => parseWorkflow(`on: workflow_dispatch\njobs:\n${jobs}`);

describe('T23: deploy.yml solo corre desde main', () => {
  it('todos los jobs reales de deploy.yml llevan la guarda de main', () => {
    const workflow = loadWorkflow('deploy.yml');
    expect(Object.keys(workflow.jobs).sort()).toEqual([
      'build-backend',
      'build-frontend',
      'deploy',
      'promote-latest',
      'test',
    ]);
    expect(deployRefGuardFindings(workflow)).toEqual([]);
  });

  describe('fixtures de mutación', () => {
    it('quitar la guarda de un job de build hace fallar el test', () => {
      const workflow = workflowWith(
        [
          '  build-frontend:',
          '    runs-on: ubuntu-latest',
          '    steps: []',
          '  deploy:',
          `    if: ${MAIN_GUARD}`,
          '    runs-on: ubuntu-latest',
          '    steps: []',
        ].join('\n'),
      );
      expect(deployRefGuardFindings(workflow)).toEqual(['sin-guarda:build-frontend']);
    });

    it('una guarda debilitada con || o always() hace fallar el test', () => {
      const workflow = workflowWith(
        [
          '  deploy:',
          `    if: \${{ ${MAIN_GUARD} || github.event_name == 'workflow_dispatch' }}`,
          '    runs-on: ubuntu-latest',
          '    steps: []',
          '  build-backend:',
          `    if: always() && ${MAIN_GUARD}`,
          '    runs-on: ubuntu-latest',
          '    steps: []',
        ].join('\n'),
      );
      expect(deployRefGuardFindings(workflow)).toEqual(['guarda-eludible:deploy', 'guarda-eludible:build-backend']);
    });

    it('una guarda contra otra rama no cuenta como guarda de main', () => {
      const workflow = workflowWith(
        ["  deploy:", "    if: github.ref == 'refs/heads/develop'", '    runs-on: ubuntu-latest', '    steps: []'].join(
          '\n',
        ),
      );
      expect(deployRefGuardFindings(workflow)).toEqual(['sin-guarda:deploy']);
    });
  });
});
