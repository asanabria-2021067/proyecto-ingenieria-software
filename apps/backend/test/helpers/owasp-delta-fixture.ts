import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './workflow-yaml';

/**
 * G08 (OWASP25-C048): repositorios Git SINTÉTICOS y desechables para probar el
 * verificador del delta con fixtures positivas y negativas. La identidad de
 * fixture va solo en `-c` de cada comando y HOME apunta al directorio
 * temporal: nunca se lee ni se modifica la configuración del usuario, y el
 * repositorio real no se toca.
 */

export const VERIFIER = join(REPO_ROOT, 'scripts/security/verify-owasp-delta.mjs');

const IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];

export interface FixtureRepo {
  dir: string;
  git(...args: string[]): string;
  /** Escribe (o borra con `null`) los archivos y crea un commit con el mensaje dado. Devuelve el SHA. */
  commit(message: string, files: Record<string, string | null>): string;
  cleanup(): void;
}

export function createFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), 'owasp-delta-'));
  const env = { PATH: process.env.PATH ?? '', HOME: dir, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C' };
  const git = (...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd: dir, encoding: 'utf8', env }).trim();
  git('init', '-q');
  const commit = (message: string, files: Record<string, string | null>) => {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        git('rm', '-q', '--', path);
      } else {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
        git('add', '--', path);
      }
    }
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Mensaje con la trazabilidad real de la workstream (tercer bloque). */
export function traceMessage(id: string, subject = 'chore(security): fixture'): string {
  return `${subject}\n\nCuerpo sintetico.\n\nSecurity/integration contract: Gate ${id.slice(0, 3)} · Commit ${id} · OWASP25-C048 (A08:2025) · T-273 · tests: fixture · rollback: RB-CODE`;
}

/** Ejecuta el verificador real contra un repositorio (sintético o real). */
export function runVerifier(args: string[], cwd = REPO_ROOT) {
  const result = spawnSync(process.execPath, [VERIFIER, ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', LANG: 'C' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
