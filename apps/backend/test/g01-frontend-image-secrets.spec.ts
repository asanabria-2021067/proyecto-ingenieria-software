import { describe, expect, it } from 'vitest';
import { findStep, loadWorkflow, readRepoFile } from './helpers/workflow-yaml';

/**
 * G01-C06 · OWASP25-C020. La imagen frontend es pública (GHCR): ningún secreto
 * de servidor puede hornearse como ARG/ENV ni llegar como build-arg. Solo se
 * admite configuración pública NEXT_PUBLIC_* y parámetros técnicos de build.
 * El guard se prueba contra fixtures para demostrar que falla cuando debe.
 */

const PUBLIC_BUILD_CONFIG = new Set(['NEXT_TELEMETRY_DISABLED', 'NODE_OPTIONS', 'NODE_ENV', 'PORT', 'HOSTNAME']);

const SERVER_ONLY_SECRETS = [
  'RESEND_API_KEY',
  'MAIL_FROM',
  'FRONTEND_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_USER',
  'DB_PASSWORD',
  'DATABASE_URL',
  'DIRECT_URL',
  'SSH_PRIVATE_KEY',
];

function isAllowedName(name: string): boolean {
  return name.startsWith('NEXT_PUBLIC_') || PUBLIC_BUILD_CONFIG.has(name);
}

function dockerfileVariableNames(dockerfile: string): string[] {
  const names: string[] = [];
  for (const line of dockerfile.split('\n')) {
    const instruction = /^\s*(ARG|ENV)\s+(.*)$/i.exec(line);
    if (!instruction) {
      continue;
    }
    // Solo nombres al inicio de cada asignación (`A=1 B=2`), no `=` dentro de un valor.
    const assigned = [...instruction[2].matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]);
    names.push(...(assigned.length > 0 ? assigned : [instruction[2].trim().split(/\s+/)[0]]));
  }
  return names;
}

/** Devuelve cada hallazgo como `origen:NOMBRE`; vacío = la imagen no recibe secretos de servidor. */
export function frontendBuildSecretFindings(dockerfile: string, buildArgs: string): string[] {
  const findings = dockerfileVariableNames(dockerfile)
    .filter((name) => !isAllowedName(name))
    .map((name) => `Dockerfile:${name}`);

  for (const line of buildArgs.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [name, ...rest] = line.split('=');
    const value = rest.join('=');
    if (!isAllowedName(name)) {
      findings.push(`build-args:${name}`);
    }
    for (const secret of SERVER_ONLY_SECRETS) {
      if (new RegExp(`secrets\\.${secret}\\b`).test(value)) {
        findings.push(`build-args:${name}<-secrets.${secret}`);
      }
    }
  }
  return findings;
}

function frontendBuildArgs(): string {
  const job = loadWorkflow('deploy.yml').jobs['build-frontend'];
  const step = findStep(job, (candidate) => candidate.uses?.startsWith('docker/build-push-action') ?? false);
  return step.with?.['build-args'] ?? '';
}

describe('G01-C06: la imagen frontend no recibe secretos de servidor', () => {
  it('el Dockerfile y los build-args reales del deploy no tienen hallazgos', () => {
    expect(frontendBuildSecretFindings(readRepoFile('apps/frontend/Dockerfile'), frontendBuildArgs())).toEqual([]);
  });

  it('RESEND_API_KEY, MAIL_FROM y FRONTEND_URL ya no aparecen en el build frontend', () => {
    const dockerfile = readRepoFile('apps/frontend/Dockerfile');
    const buildArgs = frontendBuildArgs();
    for (const name of ['RESEND_API_KEY', 'MAIL_FROM', 'FRONTEND_URL']) {
      expect(dockerfile).not.toContain(name);
      expect(buildArgs).not.toContain(name);
    }
  });

  it('la configuración pública necesaria se conserva', () => {
    const buildArgs = frontendBuildArgs();
    expect(buildArgs).toContain('NEXT_PUBLIC_API_URL=');
    expect(buildArgs).toContain('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=');
    expect(buildArgs).toContain('NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=');
  });

  describe('fixtures negativos: el guard falla cuando reaparece un secreto', () => {
    it('ARG RESEND_API_KEY en el Dockerfile', () => {
      expect(frontendBuildSecretFindings('ARG NEXT_PUBLIC_API_URL=\nARG RESEND_API_KEY\n', '')).toEqual([
        'Dockerfile:RESEND_API_KEY',
      ]);
    });

    it('ENV con un secreto horneado, también en forma de varias asignaciones', () => {
      expect(frontendBuildSecretFindings('ENV JWT_SECRET=$JWT_SECRET\n', '')).toContain('Dockerfile:JWT_SECRET');
      expect(frontendBuildSecretFindings('ENV NODE_OPTIONS=--max-old-space-size=4096 DB_PASSWORD=x\n', '')).toEqual([
        'Dockerfile:DB_PASSWORD',
      ]);
    });

    it('build-arg de servidor en el workflow', () => {
      expect(frontendBuildSecretFindings('', 'MAIL_FROM=${{ secrets.MAIL_FROM }}')).toEqual([
        'build-args:MAIL_FROM',
        'build-args:MAIL_FROM<-secrets.MAIL_FROM',
      ]);
    });

    it('un NEXT_PUBLIC_* que se alimenta de un secreto de servidor', () => {
      expect(frontendBuildSecretFindings('', 'NEXT_PUBLIC_X=${{ secrets.RESEND_API_KEY }}')).toEqual([
        'build-args:NEXT_PUBLIC_X<-secrets.RESEND_API_KEY',
      ]);
    });
  });
});
