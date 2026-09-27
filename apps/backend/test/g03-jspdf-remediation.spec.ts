import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { CLOSURE_GENERATOR_VERSION } from '../src/project-closure/project-close-readiness.service';
import { readRepoFile } from './helpers/workflow-yaml';

/**
 * G03-C10 · OWASP25-C059 reevaluado. El jsPDF del backend es alcanzable (PDF de
 * exportación y PDF de cierre) y 3.x arrastraba advisories critical/high
 * (p. ej. GHSA-f8cm-6447-x5h2, lectura de archivos locales). Se sube a 4.2.1,
 * la primera versión sin advisories conocidos. Los dos PDF se validan con
 * pdf-lib en pdf-export.builder.spec.ts y s7-report-and-crypto.spec.ts (T40-C).
 */

const MIN_JSPDF = [4, 2, 1];

interface Lockfile {
  packages: Record<string, { version?: string }>;
}

const lock = JSON.parse(readRepoFile('apps/backend/package-lock.json')) as Lockfile;
const lockedVersion = (name: string) => lock.packages[`node_modules/${name}`]?.version ?? 'ausente';

function atLeast(version: string, minimum: number[]): boolean {
  const parts = version.split('.').map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if ((parts[index] ?? 0) !== minimum[index]) {
      return (parts[index] ?? 0) > minimum[index];
    }
  }
  return true;
}

/** C159: la versión del generador de cierre nombra el renderer REAL del lockfile. */
export function generatorVersionFindings(generatorVersion: string, versions: Record<string, string>): string[] {
  return Object.entries(versions)
    .filter(([name, version]) => !generatorVersion.includes(`+${name}${version}`))
    .map(([name, version]) => `${name}${version}-no-declarado`);
}

describe('G03-C10: jsPDF del backend sin advisories conocidos', () => {
  it('el lockfile fija jsPDF >= 4.2.1 y el manifiesto no permite volver a 3.x', () => {
    expect(atLeast(lockedVersion('jspdf'), MIN_JSPDF)).toBe(true);
    const manifest = JSON.parse(readRepoFile('apps/backend/package.json')) as { dependencies: Record<string, string> };
    expect(manifest.dependencies.jspdf).toBe('^4.2.1');
  });

  it('la versión del generador de cierre coincide con jspdf y jspdf-autotable del lockfile', () => {
    const versions = { jspdf: lockedVersion('jspdf'), 'jspdf-autotable': lockedVersion('jspdf-autotable') };
    expect(generatorVersionFindings(CLOSURE_GENERATOR_VERSION, versions)).toEqual([]);
  });

  it('en Node, jsPDF rechaza leer archivos locales (GHSA-f8cm-6447-x5h2) y el backend no lo habilita', () => {
    const dir = mkdtempSync(join(tmpdir(), 'g03-jspdf-'));
    const canary = join(dir, 'canary.txt');
    writeFileSync(canary, 'no-debe-leerse');
    try {
      expect(() => new jsPDF().loadFile(canary, true)).toThrow(/local file system/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect((jsPDF as unknown as { allowFsRead?: unknown }).allowFsRead).toBeUndefined();
  });

  describe('fixtures negativos', () => {
    it('una constante que sigue nombrando 3.0.3 tras subir el renderer', () => {
      expect(
        generatorVersionFindings('closure-report/1.0.0+jspdf3.0.3+jspdf-autotable5.0.2', {
          jspdf: '4.2.1',
          'jspdf-autotable': '5.0.8',
        }),
      ).toEqual(['jspdf4.2.1-no-declarado', 'jspdf-autotable5.0.8-no-declarado']);
    });

    it('una versión vulnerable no supera el mínimo', () => {
      expect(atLeast('3.0.4', MIN_JSPDF)).toBe(false);
      expect(atLeast('4.2.0', MIN_JSPDF)).toBe(false);
      expect(atLeast('4.10.0', MIN_JSPDF)).toBe(true);
    });
  });
});
