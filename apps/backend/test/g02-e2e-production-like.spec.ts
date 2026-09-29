import { describe, expect, it } from 'vitest';
import { loadWorkflow, parseWorkflow, readRepoFile, type WorkflowJob } from './helpers/workflow-yaml';

/**
 * G02-C14 · OWASP25-C033. El E2E de CI ejercita el camino de producción: el
 * esquema se crea con `prisma migrate deploy` (nunca `db push`), el backend
 * arranca compilado y el frontend corre el build de producción (`next build` +
 * `next start`), no el dev server. Base de datos efímera del job.
 */

/** Atajos de desarrollo que no representan producción. */
export function productionLikeE2EFindings(job: WorkflowJob): string[] {
  const runs = (job.steps ?? []).map((step) => step.run ?? '').join('\n');
  const findings: string[] = [];
  if (/prisma db push/.test(runs)) {
    findings.push('db-push');
  }
  if (!/prisma migrate deploy/.test(runs)) {
    findings.push('sin-migrate-deploy');
  }
  if (/npm run dev|next dev/.test(runs)) {
    findings.push('dev-server');
  }
  if (job.env?.E2E_PRODUCTION_SERVER !== '1') {
    findings.push('playwright-sin-servidor-de-produccion');
  }
  const names = (job.steps ?? []).map((step) => step.name ?? '');
  const build = names.indexOf('Build de produccion del frontend para E2E');
  const suite = names.indexOf('Ejecutar suite de humo E2E');
  if (build < 0 || suite < 0 || build > suite) {
    findings.push('sin-build-de-produccion-antes-del-e2e');
  }
  return findings;
}

describe('G02-C14: E2E representativo de producción', () => {
  const e2e = loadWorkflow('ci.yml').jobs.e2e;

  it('el job e2e usa migraciones reales, backend compilado y build de producción del frontend', () => {
    expect(productionLikeE2EFindings(e2e)).toEqual([]);
    const backend = e2e.steps?.find((step) => step.name === 'Compilar y levantar el backend en segundo plano');
    expect(backend?.run).toContain('npm run start:prod');
  });

  it('playwright arranca `next start` cuando E2E_PRODUCTION_SERVER=1 y el dev server solo en local', () => {
    const config = readRepoFile('apps/frontend/playwright.config.ts');
    expect(config).toContain("const productionServer = process.env.E2E_PRODUCTION_SERVER === '1';");
    expect(config).toContain("command: productionServer ? 'npm run start' : 'npm run dev',");
  });

  it('el E2E solo usa servicios efímeros del runner (sin alcance a producción)', () => {
    const env = JSON.stringify(e2e.env ?? {});
    expect(env).not.toMatch(/158\.23\.57\.118|nip\.io|secrets\./);
    expect(e2e.env?.DATABASE_URL).toMatch(/@localhost:5432\/uvg_collab_e2e/);
  });

  it('fixture: el E2E antiguo con db push y dev server se detecta', () => {
    const legacy = parseWorkflow(
      [
        'on: push',
        'jobs:',
        '  e2e:',
        '    runs-on: x',
        '    steps:',
        '      - name: Preparar base de datos',
        '        run: npx prisma db push',
        '      - name: Ejecutar suite de humo E2E',
        '        run: npm run test:e2e',
      ].join('\n'),
    ).jobs.e2e;
    expect(productionLikeE2EFindings(legacy)).toEqual([
      'db-push',
      'sin-migrate-deploy',
      'playwright-sin-servidor-de-produccion',
      'sin-build-de-produccion-antes-del-e2e',
    ]);
  });
});
