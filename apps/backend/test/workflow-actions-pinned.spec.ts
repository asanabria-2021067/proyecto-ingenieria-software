import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile, REPO_ROOT } from './helpers/workflow-yaml';

/**
 * Toda acción externa de los workflows va fijada al SHA de un commit: un tag
 * (`@v4`) es mutable y, si se compromete, ese código correría en jobs con
 * `packages: write` o con la llave SSH de producción.
 */
const WORKFLOWS = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml'));

describe('workflows: acciones externas fijadas a SHA', () => {
  it('hay workflows que revisar', () => {
    expect(WORKFLOWS.length).toBeGreaterThan(3);
  });

  it.each(WORKFLOWS)('%s: cada `uses:` no local apunta a un SHA de 40 hex', (file) => {
    const usos = [...readRepoFile(`.github/workflows/${file}`).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    const sinFijar = usos.filter((uso) => !uso.startsWith('./') && !/@[0-9a-f]{40}$/.test(uso));
    expect(sinFijar).toEqual([]);
  });
});
