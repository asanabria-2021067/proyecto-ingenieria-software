import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_INSECURE_JWT_SECRETS } from '../src/config/jwt-secret';
import { DEPLOY_ENV_REGISTRY } from './helpers/deploy-env-registry';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';

/**
 * G01-C12 · OWASP25-C019/C030 + FASE2-N13. Cierre del contrato de
 * configuración de G01: el template público documenta solo nombres, tipo y
 * defaults seguros; cada variable documentada tiene consumidor; ningún
 * fallback predecible ni secreto de servidor sobrevive en el repositorio.
 */

/** Variables que solo existen para ejecutar el backend fuera de Docker. */
const LOCAL_ONLY: Record<string, string> = {
  DATABASE_URL: 'apps/backend/prisma/schema.prisma',
};

const REQUIRED_BY_CODE = ['DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL'];
const MUST_BE_BLANK = ['DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

function parseEnvTemplate(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of source.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) {
      entries.set(match[1], match[2]);
    }
  }
  return entries;
}

/** Documentadas sin consumidor registrado (ni en el deploy ni como solo-local). */
export function undocumentedConsumerFindings(names: string[]): string[] {
  return names.filter((name) => !(name in DEPLOY_ENV_REGISTRY) && !(name in LOCAL_ONLY));
}

const template = parseEnvTemplate(readRepoFile('.env.example'));

describe('G01-C12: .env.example alineado con el contrato fail-closed', () => {
  it('cada variable documentada tiene un consumidor registrado', () => {
    expect(undocumentedConsumerFindings([...template.keys()])).toEqual([]);
    for (const [name, consumer] of Object.entries(LOCAL_ONLY)) {
      expect(readRepoFile(consumer)).toContain(name);
    }
  });

  it('documenta todas las variables que el código exige para arrancar', () => {
    for (const name of REQUIRED_BY_CODE) {
      expect(template.has(name), name).toBe(true);
    }
  });

  it('los secretos se dejan vacíos: el template nunca trae un valor utilizable', () => {
    for (const name of MUST_BE_BLANK) {
      expect(template.get(name), name).toBe('');
    }
    for (const value of template.values()) {
      expect(KNOWN_INSECURE_JWT_SECRETS).not.toContain(value);
    }
  });

  it('no documenta variables sin consumidor (Resend) ni valores de producción', () => {
    const source = readRepoFile('.env.example');
    expect(source).not.toMatch(/RESEND_API_KEY|MAIL_FROM/);
    expect(source).not.toContain('158.23.57.118');
  });

  it('fixture: una variable sin consumidor se detecta', () => {
    expect(undocumentedConsumerFindings(['JWT_SECRET', 'RESEND_API_KEY'])).toEqual(['RESEND_API_KEY']);
  });
});

function listFiles(directory: string, predicate: (name: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', 'dist', '.next'].includes(entry.name) ? [] : listFiles(fullPath, predicate);
    }
    return predicate(entry.name) ? [fullPath] : [];
  });
}

describe('G01-C12: barrido global de configuración', () => {
  const PROVIDER = join(REPO_ROOT, 'apps/backend/src/config/jwt-secret.ts');
  const scanned = [
    ...listFiles(join(REPO_ROOT, 'apps/backend/src'), (name) => name.endsWith('.ts')),
    ...listFiles(join(REPO_ROOT, '.github/workflows'), (name) => name.endsWith('.yml')),
    ...['docker-compose.yml', 'docker-compose.example.yml', 'apps/backend/docker-compose.yml', '.env.example'].map(
      (file) => join(REPO_ROOT, file),
    ),
    join(REPO_ROOT, 'apps/backend/Dockerfile'),
    join(REPO_ROOT, 'apps/frontend/Dockerfile'),
  ];

  it('ningún archivo de código o configuración conserva un fallback predecible de JWT', () => {
    expect(scanned.length).toBeGreaterThan(50);
    const offenders = scanned.filter(
      (file) =>
        file !== PROVIDER &&
        KNOWN_INSECURE_JWT_SECRETS.some((insecure) => readRepoFile(file.slice(REPO_ROOT.length + 1)).includes(insecure)),
    );
    expect(offenders).toEqual([]);
  });

  it('el build del frontend no referencia secretos de servidor', () => {
    const dockerfile = readRepoFile('apps/frontend/Dockerfile');
    const deploy = readRepoFile('.github/workflows/deploy.yml');
    for (const name of ['RESEND_API_KEY', 'MAIL_FROM', 'JWT_SECRET', 'DB_PASSWORD']) {
      expect(dockerfile).not.toContain(name);
    }
    expect(deploy).not.toMatch(/secrets\.(RESEND_API_KEY|MAIL_FROM)\b/);
  });
});
