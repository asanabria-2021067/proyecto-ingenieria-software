import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findStep, loadWorkflow, parseWorkflow, type WorkflowJob } from './helpers/workflow-yaml';

/**
 * G02-C15 · OWASP25-C034. Las pruebas de integración que exigen PostgreSQL
 * real no pueden saltarse en silencio en CI: toda variable de entorno que un
 * spec de integración lee (y que decide si se omite) debe venir definida en el
 * paso de integración, apuntando únicamente al servicio efímero del job.
 */

const TEST_DIR = join(__dirname);

/** Specs incluidos en vitest.integration.config.ts. */
function integrationSpecFiles(): string[] {
  const nested = readdirSync(join(TEST_DIR, 'integration'))
    .filter((name) => name.endsWith('.integration.spec.ts'))
    .map((name) => join(TEST_DIR, 'integration', name));
  return [
    join(TEST_DIR, 'roles-participation.integration.spec.ts'),
    join(TEST_DIR, 'password-recovery-admin.real-db.e2e.spec.ts'),
    ...nested,
  ];
}

export function envReadBy(files: string[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

const EPHEMERAL_DB = /^postgresql:\/\/ci:ci@localhost:5432\/ci\?schema=public$/;

/** Variables leídas por los specs que el paso no define, o definidas fuera del servicio efímero. */
export function realDbSwitchFindings(job: WorkflowJob, required: string[]): string[] {
  const step = findStep(job, (s) => s.run === 'npm run test:integration');
  const env = { ...(job.env ?? {}), ...(step.env ?? {}) };
  const findings: string[] = [];
  for (const name of required) {
    const value = env[name];
    if (value === undefined || value === '') {
      findings.push(`sin-definir:${name}`);
    } else if (name.endsWith('_URL') && !EPHEMERAL_DB.test(String(value))) {
      findings.push(`bd-no-efimera:${name}`);
    }
  }
  return findings;
}

describe('G02-C15: integración contra PostgreSQL real en CI', () => {
  const backend = loadWorkflow('ci.yml').jobs.backend;

  it('los specs de integración leen exactamente estos interruptores de BD real', () => {
    expect(envReadBy(integrationSpecFiles())).toEqual([
      'INTEGRATION_DATABASE_URL',
      'ROLES_IT_DATABASE_URL',
      'RUN_REAL_DB_TESTS',
    ]);
  });

  it('CI define todos los interruptores y solo apuntan al PostgreSQL efímero del job', () => {
    expect(realDbSwitchFindings(backend, envReadBy(integrationSpecFiles()))).toEqual([]);
    expect(findStep(backend, (s) => s.run === 'npm run test:integration').env?.RUN_REAL_DB_TESTS).toBe('1');
  });

  it('el job backend declara el servicio PostgreSQL efímero que usan esas URLs', () => {
    const services = (backend as unknown as { services: Record<string, { image: string }> }).services;
    expect(services.postgres.image).toBe('postgres:17-alpine');
  });

  describe('fixtures negativos', () => {
    const job = (env: string) =>
      parseWorkflow(
        `on: push\njobs:\n  backend:\n    runs-on: x\n    steps:\n      - run: npm run test:integration\n        env:\n${env}`,
      ).jobs.backend;

    it('un interruptor ausente deja la suite en skip silencioso', () => {
      expect(
        realDbSwitchFindings(job('          INTEGRATION_DATABASE_URL: postgresql://ci:ci@localhost:5432/ci?schema=public\n'), [
          'INTEGRATION_DATABASE_URL',
          'RUN_REAL_DB_TESTS',
        ]),
      ).toEqual(['sin-definir:RUN_REAL_DB_TESTS']);
    });

    it('una URL que no es el servicio efímero se rechaza', () => {
      expect(
        realDbSwitchFindings(job('          ROLES_IT_DATABASE_URL: postgresql://u:p@db.example.invalid:5432/prod\n'), [
          'ROLES_IT_DATABASE_URL',
        ]),
      ).toEqual(['bd-no-efimera:ROLES_IT_DATABASE_URL']);
    });
  });
});
