import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readRepoFile, REPO_ROOT } from './helpers/workflow-yaml';

function git(args: string[]) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

/**
 * IESUC-568 (HU-199): contratos de configuración de la estabilización final
 * (defectos menores de la RTF 2). Leen los archivos versionados tal cual.
 */

describe('RTF 3.6: plantilla de pull request', () => {
  it('pide como primer campo el ticket o la HU relacionada', () => {
    const plantilla = readRepoFile('.github/pull_request_template.md');
    const primerTitulo = plantilla.split(/\r?\n/).find((linea) => linea.startsWith('## '));

    expect(primerTitulo).toBe('## Ticket o HU relacionado (IESUC-xxx / HU-xxx / T-xxx)');
    expect(plantilla).toMatch(/OBLIGATORIO/);
  });
});

describe('RTF 3.7: salida compilada de las configs de Vitest fuera del repo', () => {
  const EMITIDOS = [
    'apps/backend/vitest.config.js',
    'apps/backend/vitest.config.d.ts',
    'apps/backend/vitest.config.js.map',
    'apps/backend/vitest.integration.config.js',
  ];

  it.each(EMITIDOS)('%s no está versionado y queda ignorado', (ruta) => {
    expect(git(['ls-files', '--error-unmatch', ruta]).status).not.toBe(0);
    expect(git(['check-ignore', '--no-index', '-q', ruta]).status).toBe(0);
  });

  it('las fuentes .ts de Vitest siguen versionadas', () => {
    for (const ruta of ['apps/backend/vitest.config.ts', 'apps/backend/vitest.integration.config.ts']) {
      expect(git(['check-ignore', '--no-index', '-q', ruta]).status).not.toBe(0);
    }
  });

  it('tsconfig.json no compila las configs de Vitest (no vuelve a emitirlas)', () => {
    const tsconfig = JSON.parse(readRepoFile('apps/backend/tsconfig.json')) as { exclude?: string[] };
    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining(['node_modules', 'dist', 'vitest.config.*', 'vitest.integration.config.*']),
    );
  });
});

describe('RTF 3.9: sin .only en CI y skips condicionales justificados', () => {
  it('Playwright prohíbe test.only en CI', () => {
    expect(readRepoFile('apps/frontend/playwright.config.ts')).toMatch(/^\s*forbidOnly: !!process\.env\.CI,$/m);
  });

  it.each(['apps/backend/vitest.config.ts', 'apps/backend/vitest.integration.config.ts', 'apps/frontend/vitest.config.ts'])(
    '%s declara allowOnly: false',
    (ruta) => {
      expect(readRepoFile(ruta)).toMatch(/^\s*allowOnly: false,$/m);
    },
  );

  it.each([
    ['apps/backend/test/integration/setup/database.ts', 'describe.skip'],
    ['apps/backend/test/roles-participation.integration.spec.ts', 'describe.skip'],
    ['apps/frontend/e2e/admin-metricas-responsive.spec.ts', 'test.skip('],
    ['apps/frontend/e2e/estados-carga.spec.ts', 'test.skip('],
    ['apps/frontend/e2e/insignias-perfil.spec.ts', 'test.skip('],
  ])('cada skip condicional de %s tiene un comentario justo encima', (ruta, marcador) => {
    const lineas = readRepoFile(ruta).split(/\r?\n/);
    const indices = lineas.flatMap((linea, i) => (linea.includes(marcador) ? [i] : []));
    expect(indices.length).toBeGreaterThan(0);
    for (const i of indices) {
      expect(lineas[i - 1].trim()).toMatch(/^\/\/ /);
    }
  });
});
