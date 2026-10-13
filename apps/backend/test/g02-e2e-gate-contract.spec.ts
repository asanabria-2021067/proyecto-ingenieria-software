import { describe, expect, it } from 'vitest';
import { findStep, loadWorkflow, type Workflow } from './helpers/workflow-yaml';

/**
 * G02-C13/C14 (reescrito el 13/10) · OWASP25-C033. Desde a90b62a8 el E2E
 * (Playwright) salió por completo de ci.yml: ya no es un check automático de
 * ningún PR ni push. Sigue existiendo como workflow manual
 * (.github/workflows/e2e.yml, solo workflow_dispatch) y como suite local
 * (ver docs/ci/e2e-local.md). deploy.yml nunca lo repite: llama a ci.yml con
 * `e2e: skip` y solo corre desde `refs/heads/main`.
 */

function jobNames(workflow: Workflow): string[] {
  return Object.values(workflow.jobs).map((job) => job.name ?? '');
}

describe('G02-C13: ci.yml ya no corre ningún E2E (Playwright)', () => {
  it('ningún job de ci.yml menciona Playwright ni E2E', () => {
    const ci = loadWorkflow('ci.yml');
    for (const name of jobNames(ci)) {
      expect(name).not.toMatch(/playwright/i);
      expect(name).not.toMatch(/\bE2E\b/);
    }
    expect(Object.keys(ci.jobs)).not.toContain('e2e');
    expect(Object.keys(ci.jobs)).not.toContain('e2e-shard');
  });
});

describe('G02-C14: e2e.yml solo se dispara a mano', () => {
  const e2e = loadWorkflow('e2e.yml');

  it('el único disparador es workflow_dispatch (sin pull_request, push ni workflow_call)', () => {
    const on = (e2e as unknown as { on: Record<string, unknown> }).on;
    expect(Object.keys(on)).toEqual(['workflow_dispatch']);
  });

  it('solo lee el repositorio', () => {
    expect(e2e.permissions).toEqual({ contents: 'read' });
  });

  it('corre axe antes de la suite de humo, una sola vez (shard 1)', () => {
    const shard = e2e.jobs['e2e-shard'];
    const steps = shard.steps ?? [];
    const a11y = steps.findIndex((step) => step.name === 'Accesibilidad con axe (cinco pantallas, claro y oscuro)');
    const suite = steps.findIndex((step) => step.name === 'Ejecutar suite de humo E2E');
    expect(a11y).toBeGreaterThanOrEqual(0);
    expect(suite).toBeGreaterThan(a11y);
    expect((shard.steps?.[a11y] as { if?: string }).if).toBe('matrix.shardIndex == 1');
  });

  it('usa el build de producción del frontend (E2E_PRODUCTION_SERVER=1) y migraciones reales', () => {
    const shard = e2e.jobs['e2e-shard'];
    expect(shard.env?.E2E_PRODUCTION_SERVER).toBe('1');
    expect(findStep(shard, (step) => step.name === 'Build de produccion del frontend para E2E')).toBeDefined();
    expect(findStep(shard, (step) => step.name === 'Preparar base de datos (migraciones + seed)').run).toContain(
      'npx prisma migrate deploy',
    );
  });

  it('el job final conserva el nombre estable de siempre', () => {
    expect(e2e.jobs.e2e.name).toBe('E2E - suite de humo (Playwright)');
  });
});

describe('G02-C13/C14: deploy.yml no repite el E2E', () => {
  it('deploy.yml llama a ci.yml con e2e: skip y solo corre desde main', () => {
    const deploy = loadWorkflow('deploy.yml');
    const test = deploy.jobs.test;
    expect(test.uses).toBe('./.github/workflows/ci.yml');
    expect((test as unknown as { with?: Record<string, string> }).with).toEqual({ e2e: 'skip' });
    expect(test.if).toBe("github.ref == 'refs/heads/main'");
  });
});
