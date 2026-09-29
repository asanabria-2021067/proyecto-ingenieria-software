import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, readRepoFile, type WorkflowStep } from './helpers/workflow-yaml';

/**
 * G07-C07 · P2/P4 (A10/A07:2025). `vars.PUBLIC_API_URL` (flag con default
 * versionado `direct`, contrato de G01) elige la API que se hornea en el
 * frontend: `direct` conserva la URL directa actual (y por lo tanto la MISMA
 * variante inmutable de G02), `same-origin` hornea una cadena vacía (HTTP y
 * Socket.IO por el mismo origen, vía nginx) y otra URL http(s) se usa tal cual. Seleccionar la variante remota es del Gate Admin.
 * Se evalúa la expresión real del workflow y se ejecutan sus scripts; no hay
 * llamadas a GitHub ni a GHCR.
 */

const deploy = loadWorkflow('deploy.yml');
const CURRENT_DEFAULT = 'http://158.23.57.118:3001';
const BUILD_ACTION = 'docker/build-push-action';

function step(job: string, predicate: (s: WorkflowStep) => boolean): WorkflowStep {
  const found = deploy.jobs[job].steps?.find(predicate);
  if (!found) {
    throw new Error(`Paso no encontrado en ${job}`);
  }
  return found;
}

const variantStep = () => step('frontend-variant', (s) => s.id === 'variant');
const validationStep = () => step('frontend-variant', (s) => s.name === 'Validar PUBLIC_API_URL');
const transferStep = () => step('deploy', (s) => s.name === 'Transferir .env de produccion por stdin');

function buildArgApiUrl(): string {
  const args = step('build-frontend', (s) => s.uses?.startsWith(BUILD_ACTION) ?? false).with?.['build-args'] ?? '';
  const line = args.split('\n').map((l) => l.trim()).find((l) => l.startsWith('NEXT_PUBLIC_API_URL='));
  return line?.slice('NEXT_PUBLIC_API_URL='.length) ?? '';
}

/**
 * Evaluador mínimo de las expresiones `${{ }}` que usa este workflow: solo
 * `vars.*`/`secrets.*`, literales entre comillas simples, `!=`, `&&`, `||` y
 * paréntesis. Una variable o secreto sin definir vale '' (como en Actions), y
 * `&&`/`||` devuelven el operando, igual que en Actions.
 */
export function evaluateExpression(expression: string, context: { vars?: Record<string, string>; secrets?: Record<string, string> }): unknown {
  const body = /^\$\{\{(.*)\}\}$/s.exec(expression.trim())?.[1];
  if (body === undefined) {
    throw new Error('No es una expresión ${{ }}');
  }
  const javascript = body.replace(/\b(vars|secrets)\.([A-Z0-9_]+)\b/g, (_m, scope: string, name: string) => `(ctx.${scope}[${JSON.stringify(name)}] ?? '')`);
  if (!/^[\s()'a-zA-Z0-9_.:/\-&|!=[\]"?]*$/.test(javascript)) {
    throw new Error(`Expresión fuera del subconjunto soportado: ${body}`);
  }
  return new Function('ctx', `return (${javascript});`)({ vars: context.vars ?? {}, secrets: context.secrets ?? {} });
}

const root = mkdtempSync(join(tmpdir(), 'g07-variant-'));

function runScript(run: string, env: Record<string, string>) {
  const output = join(root, `out-${Math.random().toString(16).slice(2)}`);
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', run], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, ...env },
  });
  return { status: result.status, stderr: result.stderr, output: readFileSync(output, 'utf8') };
}

const BASE_CONFIG = {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'synthetic-cloud',
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: 'synthetic-preset',
  CSP_MODE: 'report-only',
};

function variantFor(apiUrl: string, overrides: Record<string, string> = {}) {
  return runScript(variantStep().run ?? '', { ...BASE_CONFIG, NEXT_PUBLIC_API_URL: apiUrl, ...overrides });
}

function resolvedApiUrl(context: { vars?: Record<string, string>; secrets?: Record<string, string> }) {
  const value = evaluateExpression(variantStep().env?.NEXT_PUBLIC_API_URL ?? '', context);
  expect(typeof value).toBe('string');
  return value as string;
}

describe('G07-C07: variante same-origin del frontend (PUBLIC_API_URL)', () => {
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('la variante, el build y el .env de la VM usan exactamente la misma expresión', () => {
    const expression = variantStep().env?.NEXT_PUBLIC_API_URL;
    expect(expression).toContain('vars.PUBLIC_API_URL');
    expect(buildArgApiUrl()).toBe(expression);
    expect(transferStep().env?.NEXT_PUBLIC_API_URL).toBe(expression);
  });

  it('sin la variable (o con direct) se conserva la URL actual: secreto PUBLIC_APP_URL o, sin él, el default versionado', () => {
    expect(resolvedApiUrl({})).toBe(CURRENT_DEFAULT);
    expect(resolvedApiUrl({ vars: { PUBLIC_API_URL: 'direct' } })).toBe(CURRENT_DEFAULT);
    expect(resolvedApiUrl({ secrets: { PUBLIC_APP_URL: 'https://app.example.invalid' } })).toBe('https://app.example.invalid');
  });

  it('same-origin hornea una cadena vacía; otra URL http(s) se usa tal cual', () => {
    expect(resolvedApiUrl({ vars: { PUBLIC_API_URL: 'same-origin' }, secrets: { PUBLIC_APP_URL: 'https://app.example.invalid' } })).toBe('');
    expect(resolvedApiUrl({ vars: { PUBLIC_API_URL: 'https://api.example.invalid' } })).toBe('https://api.example.invalid');
  });

  it('el default reproduce la variante previa a G07; same-origin es otra variante y volver atrás recupera el tag', () => {
    const previous = variantFor(CURRENT_DEFAULT);
    const byDefault = variantFor(resolvedApiUrl({}));
    const sameOrigin = variantFor(resolvedApiUrl({ vars: { PUBLIC_API_URL: 'same-origin' } }));
    expect(previous.status, previous.stderr).toBe(0);
    expect(sameOrigin.status, sameOrigin.stderr).toBe(0);
    expect(byDefault.output).toBe(previous.output);
    expect(sameOrigin.output).toMatch(/^variant=cfg-[0-9a-f]{12}\n$/);
    expect(sameOrigin.output).not.toBe(previous.output);
    expect(variantFor(resolvedApiUrl({})).output).toBe(previous.output);
  });

  it('la variante same-origin no rompe CSP_MODE: un modo inválido sigue abortando', () => {
    expect(variantFor('', { CSP_MODE: 'enforce' }).status).toBe(0);
    expect(variantFor('', { CSP_MODE: 'otro' }).status).not.toBe(0);
  });

  it.each(['direct', 'same-origin', 'http://api.example.invalid:3001', 'https://api.example.invalid'])(
    'PUBLIC_API_URL=%j se acepta',
    (value) => {
      expect(runScript(validationStep().run ?? '', { PUBLIC_API_URL: value }).status).toBe(0);
    },
  );

  it.each(['', 'same_origin', 'javascript:alert(1)', 'ftp://api.example.invalid', '//api.example.invalid', 'https://'])(
    'PUBLIC_API_URL=%j aborta antes de construir',
    (value) => {
      const result = runScript(validationStep().run ?? '', { PUBLIC_API_URL: value });
      expect(result.status).not.toBe(0);
      if (value) {
        expect(result.stderr).not.toContain(value);
      }
    },
  );

  it('la validación corre antes de calcular la variante y solo lee la variable', () => {
    const steps = deploy.jobs['frontend-variant'].steps ?? [];
    expect(steps.indexOf(validationStep())).toBeLessThan(steps.indexOf(variantStep()));
    expect(validationStep().env).toEqual({ PUBLIC_API_URL: "${{ vars.PUBLIC_API_URL || 'direct' }}" });
  });

  it('.env.example documenta que vacío significa mismo origen', () => {
    const example = readRepoFile('.env.example');
    expect(example).toMatch(/PUBLIC_API_URL/);
    expect(example).toMatch(/same-origin/);
  });
});
