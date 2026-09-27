import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * G01-C05 · OWASP25-C019 + VM0-F018/F022. Compose rechaza arrancar sin las
 * variables críticas en lugar de usar valores predecibles. Los defaults que
 * quedan son seguros y necesarios para desarrollo (NODE_ENV, DB_USER, DB_NAME,
 * tags :latest). Todos los valores de las pruebas son sintéticos.
 */

const REPO = join(__dirname, '../../..');
const ROOT_COMPOSE = 'docker-compose.yml';
const ROOT_EXAMPLE = 'docker-compose.example.yml';
const BACKEND_COMPOSE = 'apps/backend/docker-compose.yml';
const COMPOSE_FILES = [ROOT_COMPOSE, ROOT_EXAMPLE, BACKEND_COMPOSE];

const read = (file: string) => readFileSync(join(REPO, file), 'utf8');

const SYNTHETIC_ENV: Record<string, string> = {
  DB_USER: 'synthetic_user',
  DB_PASSWORD: 'synthetic-db-password-for-compose-test',
  JWT_SECRET: 'synthetic-jwt-secret-for-compose-contract-0',
  JWT_REFRESH_SECRET: 'synthetic-refresh-secret-for-compose-contract',
};

describe('G01-C05: compose productivo fail-closed (estático)', () => {
  it('JWT_SECRET, JWT_REFRESH_SECRET y DB_PASSWORD usan la sintaxis de variable requerida', () => {
    const root = read(ROOT_COMPOSE);
    expect(root).toMatch(/JWT_SECRET=\$\{JWT_SECRET:\?[^}]+\}/);
    expect(root).toMatch(/JWT_REFRESH_SECRET=\$\{JWT_REFRESH_SECRET:\?[^}]+\}/);
    expect(read(BACKEND_COMPOSE)).toMatch(/POSTGRES_PASSWORD: \$\{DB_PASSWORD:\?[^}]+\}/);

    for (const file of COMPOSE_FILES) {
      const source = read(file);
      for (const reference of source.match(/\$\{DB_PASSWORD[^}]*\}/g) ?? []) {
        expect(reference, `${file}: DB_PASSWORD con default`).toMatch(/^\$\{DB_PASSWORD:\?/);
      }
    }
  });

  it.each(COMPOSE_FILES)('%s no contiene defaults predecibles de secretos', (file) => {
    const source = read(file);
    expect(source).not.toContain('dev-secret-change-me');
    expect(source).not.toMatch(/\$\{(?:JWT_SECRET|JWT_REFRESH_SECRET|DB_PASSWORD):?-/);
    expect(source).not.toMatch(/PGADMIN_PASSWORD:-[^}]/);
  });

  it('conserva los defaults seguros de desarrollo', () => {
    const root = read(ROOT_COMPOSE);
    expect(root).toContain('NODE_ENV=${NODE_ENV:-development}');
    expect(root).toContain('${DB_USER:-postgres}');
    expect(root).toContain('${DB_NAME:-uvg_collab}');
  });
});

const dockerCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
const hasDockerCompose = dockerCompose.status === 0;

describe.skipIf(!hasDockerCompose)('G01-C05: docker compose config (dinámico)', () => {
  const workdir = mkdtempSync(join(tmpdir(), 'g01-compose-'));
  mkdirSync(join(workdir, 'apps/backend'), { recursive: true });
  for (const file of COMPOSE_FILES) {
    copyFileSync(join(REPO, file), join(workdir, file));
  }

  afterAll(() => rmSync(workdir, { recursive: true, force: true }));

  function composeConfig(file: string, env: Record<string, string>, profiles: string[] = []) {
    writeFileSync(
      join(workdir, '.env'),
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
    );
    const args = ['compose', '-f', file, ...profiles.flatMap((p) => ['--profile', p]), 'config', '-q'];
    // Sin heredar variables del shell: solo el .env sintético del directorio temporal.
    return spawnSync('docker', args, {
      cwd: workdir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? workdir },
    });
  }

  it.each([ROOT_COMPOSE, ROOT_EXAMPLE])('%s valida con todas las variables críticas', (file) => {
    const result = composeConfig(file, SYNTHETIC_ENV, ['app', 'tools']);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD'])(
    'docker-compose.yml falla sin %s y no expone valores',
    (missing) => {
      const { [missing]: _omitted, ...incomplete } = SYNTHETIC_ENV;
      const result = composeConfig(ROOT_COMPOSE, incomplete);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`required variable ${missing} is missing`);
      for (const value of Object.values(SYNTHETIC_ENV)) {
        expect(result.stderr).not.toContain(value);
      }
    },
  );
});
