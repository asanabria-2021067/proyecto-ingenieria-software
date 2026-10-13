import { describe, expect, it } from 'vitest';
import { decideE2e, REQUIRED_CHECK_NAME } from '../../../.github/scripts/decide-e2e.mjs';
import { loadWorkflow } from './helpers/workflow-yaml';

/**
 * G02-C13 (extension FASE-CI01): el deploy a produccion puede omitir el E2E
 * SOLO cuando puede demostrar que este commit es, byte a byte, el mismo
 * arbol que un PR hacia main ya probo con el E2E en success. Fail-closed:
 * cualquier duda corre el E2E. `decideE2e` (.github/scripts/decide-e2e.mjs)
 * es la logica pura; este archivo tambien revisa como queda cableada en
 * deploy.yml.
 */

describe('decideE2e: logica pura de la puerta (sin red)', () => {
  const okDeps = () => ({
    eventName: 'push',
    currentSha: 'sha-actual',
    fetchPrForCommit: () => ({ number: 42, headSha: 'sha-probado' }),
    fetchCommitTree: (sha: string) => (sha === 'sha-actual' || sha === 'sha-probado' ? 'tree-xyz' : null),
    fetchE2eConclusion: () => 'success',
  });

  it('workflow_dispatch siempre corre, sin consultar nada', () => {
    let consultado = false;
    const resultado = decideE2e({
      ...okDeps(),
      eventName: 'workflow_dispatch',
      fetchPrForCommit: () => {
        consultado = true;
        return null;
      },
    });
    expect(resultado.e2e).toBe('run');
    expect(consultado).toBe(false);
  });

  it('sin un PR mergeado hacia main asociado al commit: corre (fail-closed)', () => {
    const resultado = decideE2e({ ...okDeps(), fetchPrForCommit: () => null });
    expect(resultado.e2e).toBe('run');
    expect(resultado.reason).toContain('ningun PR');
  });

  it('si el arbol del commit actual no coincide con el que probo el PR: corre', () => {
    const resultado = decideE2e({ ...okDeps(), fetchCommitTree: (sha) => (sha === 'sha-actual' ? 'tree-otro' : 'tree-xyz') });
    expect(resultado.e2e).toBe('run');
    expect(resultado.reason).toContain('arbol');
  });

  it('si no se puede leer alguno de los dos arboles: corre', () => {
    const resultado = decideE2e({ ...okDeps(), fetchCommitTree: () => null });
    expect(resultado.e2e).toBe('run');
  });

  it('si el E2E probado no termino en success: corre', () => {
    for (const conclusion of ['failure', 'cancelled', null, 'skipped']) {
      const resultado = decideE2e({ ...okDeps(), fetchE2eConclusion: () => conclusion });
      expect(resultado.e2e, `conclusion=${conclusion}`).toBe('run');
    }
  });

  it('arbol igual + E2E en success: omite, y dice por que', () => {
    const resultado = decideE2e(okDeps());
    expect(resultado.e2e).toBe('skip');
    expect(resultado.reason).toContain('#42');
  });

  it('el nombre del check que busca es el del job final de ci.yml (no cambia si se renombra sin querer)', () => {
    expect(REQUIRED_CHECK_NAME).toBe('E2E - suite de humo (Playwright)');
  });
});

describe('G02-C13: deploy.yml pide la decision antes de correr las pruebas', () => {
  const deploy = loadWorkflow('deploy.yml');
  const gate = deploy.jobs['e2e-gate'];

  it('el job de decision existe, solo lee (nunca escribe) y corre antes que "test"', () => {
    expect(gate, 'jobs["e2e-gate"]').toBeDefined();
    expect(gate.permissions).toBeDefined();
    const perms = gate.permissions as Record<string, string>;
    expect(Object.values(perms).every((scope) => scope === 'read')).toBe(true);
    expect((deploy.jobs.test as { needs?: string | string[] }).needs).toBe('e2e-gate');
  });

  it('"test" ya no pide el E2E fijo: lo decide el job de arriba', () => {
    const testWith = (deploy.jobs.test as { with?: Record<string, string> }).with;
    expect(testWith?.e2e).toBe("${{ needs.e2e-gate.outputs.e2e }}");
  });

  it('el job de decision no corre fuera de main, igual que el resto del deploy', () => {
    expect((gate.if ?? '').trim()).toBe("github.ref == 'refs/heads/main'");
  });

  it('ningun job del deploy quedo con secretos o tokens expuestos en el paso de decision', () => {
    const pasos = gate.steps ?? [];
    const fuente = JSON.stringify(pasos);
    expect(fuente).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
  });
});
