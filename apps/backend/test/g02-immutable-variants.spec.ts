import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, parseWorkflow, type Workflow, type WorkflowStep } from './helpers/workflow-yaml';

/**
 * G02-C07 · FASE2-N07. Las variantes de build del frontend se publican con un
 * tag inmutable `:<sha>-cfg-<12 hex>` derivado de la configuración pública de
 * build, y ningún tag ya publicado (frontend o backend) se reconstruye ni se
 * sobrescribe. Se ejecutan los scripts reales con un `docker` falso; no hay
 * llamadas a GHCR.
 */

const BUILD_ACTION = 'docker/build-push-action';
const EXISTS_FALSE = "steps.existing.outputs.exists == 'false'";

const deploy = loadWorkflow('deploy.yml');

function step(job: string, predicate: (s: WorkflowStep) => boolean): WorkflowStep {
  const found = deploy.jobs[job].steps?.find(predicate);
  if (!found) {
    throw new Error(`Paso no encontrado en ${job}`);
  }
  return found;
}

/** Builds que podrían sobrescribir un tag existente o publicar un tag no derivado del paso vars. */
export function immutableTagFindings(workflow: Workflow): string[] {
  const findings: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const s of job.steps ?? []) {
      if (!s.uses?.startsWith(BUILD_ACTION)) {
        continue;
      }
      if (!(s as { if?: string }).if?.includes(EXISTS_FALSE)) {
        findings.push(`sin-guarda-de-existencia:${id}`);
      }
      if (!/^\$\{\{ steps\.vars\.outputs\.[a-z_]+ \}\}$/.test((s.with?.tags ?? '').trim())) {
        findings.push(`tag-no-derivado:${id}`);
      }
    }
  }
  return findings;
}

function buildArgExpressions(): Record<string, string> {
  const args = step('build-frontend', (s) => s.uses?.startsWith(BUILD_ACTION) ?? false).with?.['build-args'] ?? '';
  return Object.fromEntries(
    args
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

const root = mkdtempSync(join(tmpdir(), 'g02-variants-'));

function runStep(run: string, env: Record<string, string>) {
  const output = join(root, `out-${Math.random().toString(16).slice(2)}`);
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', run], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, ...env },
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout, output: readFileSync(output, 'utf8') };
}

function variantFor(config: Record<string, string>): string {
  const result = runStep(step('frontend-variant', (s) => s.id === 'variant').run ?? '', config);
  expect(result.status, result.stderr).toBe(0);
  return result.output.trim().replace(/^variant=/, '');
}

const CONFIG_A = {
  NEXT_PUBLIC_API_URL: 'http://legacy.example.invalid:3001',
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic-cloud',
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: 'synthetic-preset',
  // G06-C05: la variante también incluye el modo de la CSP (siempre con valor en el workflow).
  CSP_MODE: 'report-only',
};
const CONFIG_B = { ...CONFIG_A, NEXT_PUBLIC_API_URL: '' };

describe('G02-C07: variantes inmutables del frontend', () => {
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('la variante se calcula exactamente con los mismos valores que los build-args', () => {
    const env = step('frontend-variant', (s) => s.id === 'variant').env ?? {};
    expect(env).toEqual(buildArgExpressions());
  });

  it('dos configuraciones producen tags distintos y deterministas; volver a la anterior recupera su tag', () => {
    const a = variantFor(CONFIG_A);
    const b = variantFor(CONFIG_B);
    expect(a).toMatch(/^cfg-[0-9a-f]{12}$/);
    expect(b).toMatch(/^cfg-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    // Rollback de un flag de build: revertir la configuración vuelve al tag ya publicado.
    expect(variantFor(CONFIG_A)).toBe(a);
  });

  it('la salida de la variante no contiene los valores de configuración', () => {
    const result = runStep(step('frontend-variant', (s) => s.id === 'variant').run ?? '', CONFIG_A);
    for (const value of Object.values(CONFIG_A)) {
      expect(result.output + result.stdout).not.toContain(value);
    }
  });

  it('el tag del frontend combina SHA y variante; el del backend es el SHA', () => {
    const sha = 'c'.repeat(40);
    const env = { GITHUB_SHA: sha, GITHUB_REPOSITORY: 'Org/Repo', GITHUB_REPOSITORY_OWNER: 'Org' };
    const fe = runStep(step('build-frontend', (s) => s.id === 'vars').run ?? '', {
      ...env,
      FRONTEND_VARIANT: 'cfg-0123456789ab',
    });
    expect(fe.output).toBe(`frontend_tag=ghcr.io/org/repo-frontend:${sha}-cfg-0123456789ab\n`);
    const be = runStep(step('build-backend', (s) => s.id === 'vars').run ?? '', env);
    expect(be.output).toBe(`backend_tag=ghcr.io/org/repo-backend:${sha}\n`);
    expect(
      runStep(step('build-frontend', (s) => s.id === 'vars').run ?? '', { ...env, FRONTEND_VARIANT: '' }).status,
    ).not.toBe(0);
  });

  it('ningún build puede sobrescribir un tag existente', () => {
    expect(immutableTagFindings(deploy)).toEqual([]);
  });

  describe('comprobación real de existencia con un docker falso', () => {
    function existing(job: string, fakeDocker: string) {
      const bin = join(root, `bin-${job}-${Math.random().toString(16).slice(2)}`);
      mkdirSync(bin);
      writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash\n${fakeDocker}\n`);
      chmodSync(join(bin, 'docker'), 0o755);
      return runStep(step(job, (s) => s.id === 'existing').run ?? '', {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        IMAGE_TAG: 'ghcr.io/org/repo-frontend:tag',
      });
    }

    it.each(['build-frontend', 'build-backend'])('%s: tag existente → se reutiliza (exists=true)', (job) => {
      const result = existing(job, 'echo "Name: tag"; exit 0');
      expect(result.status).toBe(0);
      expect(result.output).toBe('exists=true\n');
    });

    it.each(['build-frontend', 'build-backend'])('%s: tag inexistente → se construye (exists=false)', (job) => {
      const result = existing(job, 'echo "ERROR: ghcr.io/org/repo:tag: not found" >&2; exit 1');
      expect(result.status).toBe(0);
      expect(result.output).toBe('exists=false\n');
    });

    it.each(['build-frontend', 'build-backend'])('%s: error de GHCR distinto de not found → aborta', (job) => {
      const result = existing(job, 'echo "ERROR: unauthorized" >&2; exit 1');
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
    });
  });

  it('fixture: un build sin guarda de existencia o con tag literal se detecta', () => {
    const fixture = parseWorkflow(
      [
        'on: push',
        'jobs:',
        '  build:',
        '    runs-on: x',
        '    steps:',
        `      - uses: ${BUILD_ACTION}@v5`,
        '        with:',
        '          tags: img:${{ github.sha }}',
      ].join('\n'),
    );
    expect(immutableTagFindings(fixture)).toEqual(['sin-guarda-de-existencia:build', 'tag-no-derivado:build']);
  });
});
