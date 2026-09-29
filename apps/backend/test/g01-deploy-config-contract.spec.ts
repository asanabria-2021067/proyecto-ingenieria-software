import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEPLOY_ENV_REGISTRY, DEPLOY_TRANSPORT_ONLY } from './helpers/deploy-env-registry';
import { REPO_ROOT, loadWorkflow, readRepoFile } from './helpers/workflow-yaml';

/**
 * G01-C08 · OWASP25-C030 + VM0-F019. Contrato de configuración del deploy:
 * cada variable del .env de producción tiene un consumidor registrado y cada
 * flag `vars.X` declara un default. Los fixtures prueban que el guard falla.
 */

const TRANSFER_STEP = 'Transferir .env de produccion por stdin';

/** Nombres escritos en el .env por el paso de transferencia (`printf 'NOMBRE=...`). */
export function envFileNames(run: string): string[] {
  return [...run.matchAll(/printf '([A-Z][A-Z0-9_]*)=/g)].map((match) => match[1]);
}

/** Toda referencia a `vars.X` debe tener la forma `vars.X || '<default>'`. */
export function flagWithoutDefaultFindings(workflowSource: string): string[] {
  // `(?<![.\w])` excluye accesos como `steps.vars.outputs.*` (id de un paso, no el contexto `vars`).
  return [...workflowSource.matchAll(/(?<![.\w])vars\.([A-Za-z_][A-Za-z0-9_]*)(\s*\|\|\s*'[^']*')?/g)]
    .filter((match) => match[2] === undefined)
    .map((match) => match[1]);
}

/** Variables escritas que no están en el registro, y entradas del registro que ya no se escriben. */
export function orphanFindings(written: string[], registered: string[]): string[] {
  return [
    ...written.filter((name) => !registered.includes(name)).map((name) => `sin-registro:${name}`),
    ...registered.filter((name) => !written.includes(name)).map((name) => `registro-huerfano:${name}`),
  ];
}

function transferStep() {
  const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.name === TRANSFER_STEP);
  if (!step?.run || !step.env) {
    throw new Error('Paso de transferencia ausente');
  }
  return { run: step.run, env: step.env };
}

describe('G01-C08: registro de variables y flags del deploy', () => {
  it('cada variable escrita en el .env está registrada y cada registrada se escribe', () => {
    expect(orphanFindings(envFileNames(transferStep().run), Object.keys(DEPLOY_ENV_REGISTRY))).toEqual([]);
  });

  it.each(Object.entries(DEPLOY_ENV_REGISTRY))('%s tiene un consumidor real', (name, entry) => {
    expect(existsSync(join(REPO_ROOT, entry.consumer)), entry.consumer).toBe(true);
    expect(readRepoFile(entry.consumer)).toContain(name);
  });

  it('las variables del paso son exactamente las del .env más las de transporte SSH', () => {
    const { run, env } = transferStep();
    const expected = [...new Set([...envFileNames(run), ...DEPLOY_TRANSPORT_ONLY])];
    const constants = ['NODE_ENV', 'DB_NAME', 'DB_PORT', 'NEXT_PUBLIC_API_PREFIX'];
    expect(Object.keys(env).sort()).toEqual(expected.filter((name) => !constants.includes(name)).sort());
  });

  it('RESEND_API_KEY y MAIL_FROM (sin consumidor) ya no se escriben en producción', () => {
    const source = readRepoFile('.github/workflows/deploy.yml');
    expect(source).not.toContain('RESEND_API_KEY');
    expect(source).not.toContain('MAIL_FROM');
  });

  it('todo flag vars.X del deploy declara un default y coincide con el registro', () => {
    const source = readRepoFile('.github/workflows/deploy.yml');
    expect(flagWithoutDefaultFindings(source)).toEqual([]);
    for (const [name, entry] of Object.entries(DEPLOY_ENV_REGISTRY)) {
      if (entry.kind === 'flag') {
        expect(source).toContain(`vars.${name} || '${entry.defaultValue}'`);
      }
    }
  });

  describe('fixtures negativos', () => {
    it('un flag sin default', () => {
      expect(flagWithoutDefaultFindings("TRUST_PROXY_HOPS: ${{ vars.TRUST_PROXY_HOPS }}")).toEqual([
        'TRUST_PROXY_HOPS',
      ]);
      expect(flagWithoutDefaultFindings("TRUST_PROXY_HOPS: ${{ vars.TRUST_PROXY_HOPS || '0' }}")).toEqual([]);
      expect(flagWithoutDefaultFindings('X: ${{ steps.vars.outputs.backend_image }}')).toEqual([]);
    });

    it('una variable escrita sin registro y una registrada que ya no se escribe', () => {
      const run = "printf 'NODE_ENV=production\\n'\nprintf 'MAIL_FROM=%s\\n' \"$MAIL_FROM\"";
      expect(orphanFindings(envFileNames(run), ['NODE_ENV', 'FRONTEND_URL'])).toEqual([
        'sin-registro:MAIL_FROM',
        'registro-huerfano:FRONTEND_URL',
      ]);
    });
  });
});
