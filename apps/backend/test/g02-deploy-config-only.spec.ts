import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, parseWorkflow, readRepoFile, type Workflow } from './helpers/workflow-yaml';

/**
 * G02-C06 · FASE2-N07. `config-only` reaplica la configuración runtime sin
 * construir, publicar ni mover tags, y solo con imágenes ya publicadas. Se
 * valida el contrato del workflow y se ejecuta el paso real que elige las
 * imágenes. Todo es local: no hay llamadas a GitHub, GHCR ni a la VM.
 */

const CONFIG_ONLY_SKIP = "inputs.mode != 'config-only'";

interface DispatchInput {
  type?: string;
  options?: string[];
  default?: string;
}

/** Pasos que construyen, publican o mueven tags sin excluir config-only. */
export function configOnlyFindings(workflow: Workflow): string[] {
  const findings: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      const publishes =
        step.uses?.startsWith('docker/build-push-action') || /imagetools create|docker push/.test(step.run ?? '');
      if (publishes && !(step as { if?: string }).if?.includes(CONFIG_ONLY_SKIP)) {
        findings.push(`publica-en-config-only:${id}:${step.name ?? step.uses}`);
      }
    }
  }
  return findings;
}

const deploy = loadWorkflow('deploy.yml');
const dispatchInputs = (
  (deploy as unknown as { on: { workflow_dispatch: { inputs: Record<string, DispatchInput> } } }).on
    .workflow_dispatch.inputs
);

function prepareImagesRun(): string {
  const step = deploy.jobs.deploy.steps?.find((s) => s.name === 'Prepare image names');
  if (!step?.run) {
    throw new Error('Paso Prepare image names ausente');
  }
  return step.run;
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const VARIANT = 'cfg-0123456789ab';

function selectImages(mode: string, requested: string, variant = VARIANT) {
  const dir = mkdtempSync(join(tmpdir(), 'g02-config-only-'));
  const output = join(dir, 'output');
  writeFileSync(output, '');
  try {
    const result = spawnSync('bash', ['-c', prepareImagesRun()], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        GITHUB_OUTPUT: output,
        GITHUB_SHA: SHA_A,
        GITHUB_REPOSITORY: 'Org/Repo-Name',
        GITHUB_REPOSITORY_OWNER: 'Org',
        DEPLOY_MODE: mode,
        REQUESTED_IMAGE_SHA: requested,
        FRONTEND_VARIANT: variant,
      },
    });
    return { status: result.status, stderr: result.stderr, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('G02-C06: modo config-only (contrato)', () => {
  it('workflow_dispatch ofrece full | config-only con full por defecto', () => {
    expect(dispatchInputs.mode).toMatchObject({ type: 'choice', options: ['full', 'config-only'], default: 'full' });
    expect(dispatchInputs.image_sha).toMatchObject({ type: 'string', default: '' });
  });

  it('ningún paso construye, publica ni mueve tags en config-only', () => {
    expect(configOnlyFindings(deploy)).toEqual([]);
    for (const id of ['build-frontend', 'build-backend', 'promote-latest']) {
      for (const step of deploy.jobs[id].steps ?? []) {
        expect((step as { if?: string }).if, `${id}/${step.name}`).toContain(CONFIG_ONLY_SKIP);
      }
    }
  });

  it('los tests corren en ambos modos y el deploy sigue dependiendo de ellos y de main', () => {
    expect(deploy.jobs.test.if).toBe("github.ref == 'refs/heads/main'");
    expect(deploy.jobs.deploy.needs).toEqual(['test', 'frontend-variant', 'build-frontend', 'build-backend']);
  });

  it('el deploy verifica en GHCR las imágenes antes de conectar a la VM', () => {
    const names = (deploy.jobs.deploy.steps ?? []).map((step) => step.name);
    const verify = names.indexOf('Verificar que las imagenes a desplegar existen en GHCR');
    expect(verify).toBeGreaterThan(names.indexOf('Prepare image names'));
    expect(verify).toBeLessThan(names.indexOf('Transferir .env de produccion por stdin'));
    expect(deploy.jobs.deploy.permissions).toEqual({ contents: 'read', packages: 'read' });
  });

  it('los inputs nunca se interpolan dentro de un script (solo llegan por env)', () => {
    const scripts = Object.values(deploy.jobs).flatMap((job) =>
      (job.steps ?? []).map((step) => `${step.run ?? ''}${step.with?.script ?? ''}`),
    );
    expect(scripts.filter((script) => script.includes('${{ inputs.'))).toEqual([]);
    expect(readRepoFile('.github/workflows/deploy.yml')).toContain("DEPLOY_MODE: ${{ inputs.mode || 'full' }}");
  });

  it('fixture: un build sin exclusión de config-only se detecta', () => {
    const fixture = parseWorkflow(
      'on: push\njobs:\n  build:\n    runs-on: x\n    steps:\n      - name: Build\n        uses: docker/build-push-action@v5\n',
    );
    expect(configOnlyFindings(fixture)).toEqual(['publica-en-config-only:build:Build']);
  });
});

describe('G02-C06: selección real de imágenes', () => {
  it('full sin image_sha despliega las imágenes del commit', () => {
    const result = selectImages('full', '');
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe(
      `frontend_image=ghcr.io/org/repo-name-frontend:${SHA_A}-${VARIANT}\nbackend_image=ghcr.io/org/repo-name-backend:${SHA_A}\n`,
    );
  });

  it('config-only reutiliza el SHA pedido', () => {
    const result = selectImages('config-only', SHA_B);
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain(`-frontend:${SHA_B}-${VARIANT}\n`);
    expect(result.output).toContain(`-backend:${SHA_B}\n`);
  });

  it.each([
    ['full con image_sha', 'full', SHA_B],
    ['modo desconocido', 'rebuild-all', ''],
    ['SHA corto', 'config-only', 'abc123'],
    ['SHA con inyección', 'config-only', `${SHA_B}; curl evil`],
    ['SHA en mayúsculas', 'config-only', 'A'.repeat(40)],
  ])('rechaza %s sin producir imágenes', (_caso, mode, requested) => {
    const result = selectImages(mode, requested);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
  });

  it.each([['ausente', ''], ['sin prefijo', '0123456789ab'], ['con inyección', 'cfg-0123456789ab; id']])(
    'G02-C07: rechaza una variante de frontend %s',
    (_caso, variant) => {
      const result = selectImages('full', '', variant);
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
    },
  );
});
