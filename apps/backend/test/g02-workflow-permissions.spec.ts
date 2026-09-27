import { describe, expect, it } from 'vitest';
import { loadWorkflow, parseWorkflow, type Workflow, type WorkflowPermissions } from './helpers/workflow-yaml';

/**
 * G02-C02 · OWASP25-C044. Permisos mínimos del GITHUB_TOKEN y concurrencia
 * segura: CI solo lee; en deploy.yml únicamente los jobs que publican en GHCR
 * obtienen `packages: write`; el deploy productivo se serializa sin cancelar
 * un release en curso. Los fixtures prueban que el guard detecta excesos.
 */

const PUBLISH_JOBS = ['build-frontend', 'build-backend', 'promote-latest'];

function writeScopes(permissions: WorkflowPermissions | undefined): string[] {
  if (permissions === undefined) {
    return [];
  }
  if (typeof permissions === 'string') {
    return permissions === 'read-all' ? [] : [permissions];
  }
  return Object.entries(permissions)
    .filter(([, level]) => level === 'write')
    .map(([scope]) => scope);
}

/** Permisos excesivos: default ausente, default con escritura o escritura fuera de los jobs permitidos. */
export function permissionFindings(workflow: Workflow, allowedPublishJobs: string[]): string[] {
  const findings: string[] = [];
  if (workflow.permissions === undefined) {
    findings.push('sin-permisos-por-defecto');
  } else if (writeScopes(workflow.permissions).length > 0) {
    findings.push(`default-con-escritura:${writeScopes(workflow.permissions).join(',')}`);
  }
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const writes = writeScopes(job.permissions);
    const allowed = allowedPublishJobs.includes(id) ? ['packages'] : [];
    const excess = writes.filter((scope) => !allowed.includes(scope));
    if (excess.length > 0) {
      findings.push(`escritura-no-permitida:${id}:${excess.join(',')}`);
    }
  }
  return findings;
}

describe('G02-C02: permisos mínimos y concurrencia', () => {
  it('ci.yml solo tiene contents: read y ningún job escribe', () => {
    const ci = loadWorkflow('ci.yml');
    expect(ci.permissions).toEqual({ contents: 'read' });
    expect(permissionFindings(ci, [])).toEqual([]);
  });

  it('deploy.yml: default de solo lectura y packages: write solo en los jobs de publicación', () => {
    const deploy = loadWorkflow('deploy.yml');
    expect(deploy.permissions).toEqual({ contents: 'read' });
    expect(permissionFindings(deploy, PUBLISH_JOBS)).toEqual([]);
    for (const id of PUBLISH_JOBS) {
      expect(deploy.jobs[id].permissions).toEqual({ contents: 'read', packages: 'write' });
    }
    expect(deploy.jobs.deploy.permissions).toBeUndefined();
  });

  it('CI cancela corridas obsoletas; el deploy productivo se serializa sin cancelar el que está en curso', () => {
    expect(loadWorkflow('ci.yml').concurrency).toEqual({ group: 'ci-${{ github.ref }}', 'cancel-in-progress': true });
    expect(loadWorkflow('deploy.yml').concurrency).toEqual({ group: 'deploy-production', 'cancel-in-progress': false });
  });

  describe('fixtures negativos', () => {
    const fixture = (header: string, jobs: string) => parseWorkflow(`on: push\n${header}jobs:\n${jobs}`);

    it('sin permisos por defecto o con write-all', () => {
      expect(permissionFindings(fixture('', '  a:\n    runs-on: x\n'), [])).toEqual(['sin-permisos-por-defecto']);
      expect(permissionFindings(fixture('permissions: write-all\n', '  a:\n    runs-on: x\n'), [])).toEqual([
        'default-con-escritura:write-all',
      ]);
    });

    it('un job de CI que pide packages: write o contents: write', () => {
      const workflow = fixture(
        'permissions:\n  contents: read\n',
        '  backend:\n    runs-on: x\n    permissions:\n      contents: write\n      packages: write\n',
      );
      expect(permissionFindings(workflow, [])).toEqual(['escritura-no-permitida:backend:contents,packages']);
    });

    it('el job de deploy no puede pedir packages: write aunque los de build sí', () => {
      const workflow = fixture(
        'permissions:\n  contents: read\n',
        '  build-frontend:\n    runs-on: x\n    permissions:\n      packages: write\n  deploy:\n    runs-on: x\n    permissions:\n      packages: write\n',
      );
      expect(permissionFindings(workflow, PUBLISH_JOBS)).toEqual(['escritura-no-permitida:deploy:packages']);
    });
  });
});
