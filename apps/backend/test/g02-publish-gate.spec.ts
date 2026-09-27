import { describe, expect, it } from 'vitest';
import { loadWorkflow, parseWorkflow, type Workflow } from './helpers/workflow-yaml';

/**
 * G02-C04 · OWASP25-C035. Ninguna imagen se construye ni publica si los tests
 * fallan, y el tag mutable `:latest` solo se mueve cuando tests, builds y
 * deploy terminaron en verde. Se verifica el grafo real de `needs` y los
 * fixtures demuestran que el guard detecta un build sin dependencia de tests
 * o un `:latest` publicado antes de tiempo.
 */

const BUILD_ACTION = 'docker/build-push-action';

function needsOf(workflow: Workflow, id: string): string[] {
  const needs = workflow.jobs[id]?.needs ?? [];
  return Array.isArray(needs) ? needs : [needs];
}

/** Cierre transitivo de `needs` de un job. */
export function upstreamJobs(workflow: Workflow, id: string): Set<string> {
  const seen = new Set<string>();
  const pending = [...needsOf(workflow, id)];
  while (pending.length > 0) {
    const next = pending.pop() as string;
    if (!seen.has(next)) {
      seen.add(next);
      pending.push(...needsOf(workflow, next));
    }
  }
  return seen;
}

export function publishGateFindings(workflow: Workflow, testJob = 'test'): string[] {
  const findings: string[] = [];
  const buildJobs: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith(BUILD_ACTION)) {
        buildJobs.push(id);
        if (!upstreamJobs(workflow, id).has(testJob)) {
          findings.push(`build-sin-tests:${id}`);
        }
        if (/:latest\b/.test(step.with?.tags ?? '')) {
          findings.push(`latest-en-build:${id}`);
        }
      }
      if (/:latest\b/.test(step.run ?? '')) {
        const upstream = upstreamJobs(workflow, id);
        const required = [testJob, 'deploy', ...buildJobs];
        const missing = required.filter((job) => !upstream.has(job));
        if (missing.length > 0) {
          findings.push(`latest-antes-de-verde:${id}:${missing.join(',')}`);
        }
      }
    }
  }
  return findings;
}

describe('G02-C04: publicar solo tras tests verdes', () => {
  const deploy = loadWorkflow('deploy.yml');

  it('el grafo real no permite construir ni mover latest sin tests, builds y deploy verdes', () => {
    expect(publishGateFindings(deploy)).toEqual([]);
    expect(needsOf(deploy, 'build-frontend')).toContain('test');
    expect(needsOf(deploy, 'build-backend')).toEqual(['test']);
    expect([...upstreamJobs(deploy, 'promote-latest')].sort()).toEqual([
      'build-backend',
      'build-frontend',
      'deploy',
      'frontend-variant',
      'test',
    ]);
  });

  it('los builds publican únicamente el tag inmutable del commit (G02-C07: derivado en el paso vars)', () => {
    for (const [id, output] of [
      ['build-frontend', 'frontend_tag'],
      ['build-backend', 'backend_tag'],
    ]) {
      const build = deploy.jobs[id].steps?.find((step) => step.uses?.startsWith(BUILD_ACTION));
      expect(build?.with?.tags?.trim()).toBe(`\${{ steps.vars.outputs.${output} }}`);
      const vars = deploy.jobs[id].steps?.find((step) => step.id === 'vars');
      expect(vars?.run).toContain(`${output}=ghcr.io/`);
      expect(vars?.run).toContain(':${GITHUB_SHA}');
      expect(vars?.run).not.toContain('latest');
    }
  });

  describe('fixtures negativos', () => {
    const fixture = (jobs: string) => parseWorkflow(`on: push\njobs:\n  test:\n    runs-on: x\n${jobs}`);
    const build = (needs: string, tags: string) =>
      `  build:\n    runs-on: x\n${needs}    steps:\n      - uses: ${BUILD_ACTION}@v5\n        with:\n          tags: ${tags}\n`;

    it('un build sin needs: test', () => {
      expect(publishGateFindings(fixture(build('', 'img:${{ github.sha }}')))).toEqual(['build-sin-tests:build']);
    });

    it('un build que además publica :latest', () => {
      expect(publishGateFindings(fixture(build('    needs: test\n', 'img:latest')))).toEqual(['latest-en-build:build']);
    });

    it('mover :latest sin esperar al deploy', () => {
      const jobs =
        build('    needs: test\n', 'img:${{ github.sha }}') +
        '  deploy:\n    runs-on: x\n    needs: build\n    steps: []\n' +
        '  promote:\n    runs-on: x\n    needs: build\n    steps:\n      - run: docker buildx imagetools create --tag img:latest img:sha\n';
      expect(publishGateFindings(fixture(jobs))).toEqual(['latest-antes-de-verde:promote:deploy']);
    });
  });
});
