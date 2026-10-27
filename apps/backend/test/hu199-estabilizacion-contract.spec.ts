import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';

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
