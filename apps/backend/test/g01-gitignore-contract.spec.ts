import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers/workflow-yaml';

/**
 * G01-C11 · FASE2-N08. Git ignora dumps, backups, material de clave y
 * variantes de .env con valores reales, sin ocultar archivos que sí deben
 * versionarse (template de entorno, migraciones de Prisma). Solo se consultan
 * rutas de ejemplo con `git check-ignore --no-index`; no se crea ningún archivo.
 */

function git(args: string[]) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

const isIgnored = (path: string) => git(['check-ignore', '--no-index', '-q', path]).status === 0;

const MUST_BE_IGNORED = [
  'backups/pre-release-B-20260927.dump',
  'apps/backend/prod.dump',
  'apps/backend/prod.pgdump',
  'restore.backup',
  'dump.sql.gz',
  'backup/uvg_collab.sql',
  'owasp-wip/G01-C07.patch',
  'infra/tls/privkey.pem',
  'certs/server.key',
  'keystore.p12',
  'client.pfx',
  '.env',
  '.env.production',
  'apps/backend/.env.production',
];

const MUST_STAY_TRACKABLE = [
  '.env.example',
  'apps/backend/prisma/migrations/20260330042723_init/migration.sql',
  'docker-compose.yml',
  'apps/frontend/public/placeholder.png',
];

describe('G01-C11: dumps, backups y claves fuera de Git', () => {
  it.each(MUST_BE_IGNORED)('%s queda ignorado', (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it.each(MUST_STAY_TRACKABLE)('%s sigue siendo versionable', (path) => {
    expect(isIgnored(path)).toBe(false);
  });

  it('ningún archivo ya versionado queda cubierto por los patrones nuevos', () => {
    const result = git(['ls-files', '-ci', '--exclude-standard']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});
