import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadWorkflow, readRepoFile } from './helpers/workflow-yaml';

/**
 * G06-C05 · OWASP25-C039. CSP_MODE es de build: entra en la variante inmutable
 * del frontend (G02-C07) y en los build-args con default 'report-only'. Cambiar
 * de modo produce otra variante; volver al anterior recupera su tag. El paso de
 * la variante rechaza un valor inválido antes de construir nada.
 */

const deploy = loadWorkflow('deploy.yml');
const variantStep = deploy.jobs['frontend-variant'].steps?.find((s) => s.id === 'variant');
const buildStep = deploy.jobs['build-frontend'].steps?.find((s) => s.uses?.startsWith('docker/build-push-action'));
const DEFAULT = "${{ vars.CSP_MODE || 'report-only' }}";
const root = mkdtempSync(join(tmpdir(), 'g06-csp-mode-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function variant(cspMode: string) {
  const output = join(root, `out-${Math.random().toString(16).slice(2)}`);
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', variantStep?.run ?? 'exit 99'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_OUTPUT: output,
      NEXT_PUBLIC_API_URL: 'http://api.example.invalid:3001',
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic',
      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: 'synthetic',
      CSP_MODE: cspMode,
    },
  });
  return { status: result.status, stderr: result.stderr, variant: readFileSync(output, 'utf8').trim() };
}

describe('G06-C05: CSP_MODE en el deploy (variante inmutable)', () => {
  it('la variante y el build-arg usan el mismo flag con default report-only', () => {
    expect(variantStep?.env?.CSP_MODE).toBe(DEFAULT);
    expect(buildStep?.with?.['build-args']).toContain(`CSP_MODE=${DEFAULT}`);
  });

  it('report-only y enforce son variantes distintas y deterministas', () => {
    const reportOnly = variant('report-only');
    const enforce = variant('enforce');
    expect(reportOnly.status, reportOnly.stderr).toBe(0);
    expect(enforce.status, enforce.stderr).toBe(0);
    expect(reportOnly.variant).toMatch(/^variant=cfg-[0-9a-f]{12}$/);
    expect(enforce.variant).not.toBe(reportOnly.variant);
    expect(variant('report-only').variant).toBe(reportOnly.variant);
  });

  it.each(['', 'Enforce', 'block', 'enforce; rm -rf /'])('rechaza CSP_MODE=%j sin calcular variante', (value) => {
    const result = variant(value);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CSP_MODE solo admite report-only o enforce');
    expect(result.variant).toBe('');
  });

  it('el Dockerfile hornea CSP_MODE en la etapa de build con default report-only', () => {
    const dockerfile = readRepoFile('apps/frontend/Dockerfile');
    expect(dockerfile).toContain('ARG CSP_MODE=report-only');
    const build = dockerfile.slice(dockerfile.indexOf('AS build'), dockerfile.indexOf('AS production'));
    expect(build).toContain('ENV CSP_MODE=$CSP_MODE');
    expect(build.indexOf('ENV CSP_MODE=$CSP_MODE')).toBeLessThan(build.indexOf('RUN npm run build'));
  });
});
