import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow } from './helpers/workflow-yaml';

/**
 * G02-C05 · VM0-F020. El deploy aborta si la copia productiva tiene cambios
 * locales, en vez de esconderlos en un stash o descartarlos. Se ejecuta la
 * parte real del script remoto contra repositorios git temporales que imitan
 * la VM (origin bare + copia de trabajo). Nada toca producción.
 */

const SSH_ACTION = 'appleboy/ssh-action';

function remoteScript(): string {
  const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.uses?.startsWith(SSH_ACTION));
  return step?.with?.script ?? '';
}

/** Desde el inicio del script hasta la actualización del checkout (antes de instalar el .env). */
function checkoutSection(script: string): string {
  const lines = script.split('\n');
  const end = lines.findIndex((line) => line.includes('git reset --hard FETCH_HEAD'));
  return lines.slice(0, end + 1).join('\n');
}

describe('G02-C05: el checkout productivo sucio aborta el deploy (estático)', () => {
  const script = remoteScript();

  it('no usa stash ni descarta cambios antes de verificar la copia', () => {
    expect(script).not.toMatch(/git stash/);
    const check = script.indexOf('git status --porcelain');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(script.indexOf('git fetch'));
    expect(check).toBeLessThan(script.indexOf('git reset --hard'));
    expect(script).toMatch(/exit 1/);
  });
});

const git = (cwd: string, ...args: string[]) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: cwd,
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });

describe('G02-C05: ejecución real contra repositorios temporales', () => {
  const root = mkdtempSync(join(tmpdir(), 'g02-dirty-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function prepareVm(name: string) {
    const home = join(root, name);
    const origin = join(home, 'origin.git');
    const seed = join(home, 'seed');
    const project = join(home, 'proyecto-ingenieria-software');
    mkdirSync(seed, { recursive: true });
    git(home, 'init', '--bare', '-b', 'main', origin);
    git(seed, 'init', '-b', 'main');
    writeFileSync(join(seed, 'app.txt'), 'v1\n');
    writeFileSync(join(seed, '.gitignore'), '.env\n');
    git(seed, 'add', 'app.txt', '.gitignore');
    git(seed, 'commit', '-m', 'v1');
    git(seed, 'push', origin, 'main');
    git(home, 'clone', '--depth=1', '--branch', 'main', `file://${origin}`, project);
    writeFileSync(join(seed, 'app.txt'), 'v2\n');
    git(seed, 'commit', '-am', 'v2');
    git(seed, 'push', origin, 'main');
    // El .env ignorado no cuenta como cambio local.
    writeFileSync(join(project, '.env'), 'SYNTHETIC=1\n');
    return { home, project };
  }

  function runCheckout(home: string) {
    return spawnSync('bash', ['-c', checkoutSection(remoteScript())], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: home, GIT_CONFIG_NOSYSTEM: '1' },
      // stdin a /dev/null: con un socket como stdin, bash lo trata como sesión remota y carga ~/.bashrc.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  it('copia limpia (solo .env ignorado): actualiza a origin/main', () => {
    const { home, project } = prepareVm('clean');
    const result = runCheckout(home);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(project, 'app.txt'), 'utf8')).toBe('v2\n');
    expect(existsSync(join(project, '.env'))).toBe(true);
  });

  it('archivo versionado modificado: aborta, no hace stash y conserva el cambio', () => {
    const { home, project } = prepareVm('tracked');
    writeFileSync(join(project, 'app.txt'), 'hotfix manual\n');
    const result = runCheckout(home);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('app.txt');
    expect(readFileSync(join(project, 'app.txt'), 'utf8')).toBe('hotfix manual\n');
    expect(git(project, 'stash', 'list').stdout.trim()).toBe('');
  });

  it('archivo no versionado nuevo: aborta sin borrarlo', () => {
    const { home, project } = prepareVm('untracked');
    writeFileSync(join(project, 'residuo.sh'), 'echo residuo\n');
    const result = runCheckout(home);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('residuo.sh');
    expect(existsSync(join(project, 'residuo.sh'))).toBe(true);
    expect(readFileSync(join(project, 'app.txt'), 'utf8')).toBe('v1\n');
  });
});
