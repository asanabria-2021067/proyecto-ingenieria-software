import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';
import {
  GIT_MAX_BUFFER,
  PHASE2_BASE,
  PHASE2_DEVELOP_BASE,
  PHASE2_DEVELOP_TIP,
  PHASE2_TIP,
  TRACE,
  git,
  gitAvailable,
  lineageMap,
  phaseLineage,
  shaInLineage,
} from './helpers/owasp-evidence';

/**
 * G08 · OWASP25-C048 (A08:2025). `develop` integró la fase OWASP con los hashes
 * de commit reescritos, así que los hashes que citan los documentos de
 * evidencia (los de `sprint8/vernel-owasp2025`) no son ancestros de una rama
 * que parte de `develop`. `docs/security/owasp-phase-lineage.json` declara la
 * correspondencia commit a commit y aquí se demuestra contra el Git local, sin
 * confiar en el archivo: mismo patch-id, mismo orden, sin merges, y —cuando
 * los dos linajes están en el repositorio— mismo autor, fecha, mensaje y
 * árboles. Las demás pruebas `g08-*` auditan la fase en el linaje que contiene
 * HEAD apoyándose solo en lo que esta prueba verifica.
 */

const map = lineageMap();
const index = readRepoFile('docs/security/evidence-index.md');

function exists(sha: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** SHA → patch-id estable de cada commit del rango, en una sola lectura del historial. */
function patchIds(range: string): Map<string, string> {
  const log = execFileSync('git', ['log', '-p', range], { cwd: REPO_ROOT, maxBuffer: GIT_MAX_BUFFER });
  const out = execFileSync('git', ['patch-id', '--stable'], { cwd: REPO_ROOT, input: log, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
  return new Map(out.trim().split('\n').map((line) => line.split(' ').reverse() as [string, string]));
}

const developAvailable = gitAvailable() && exists(PHASE2_DEVELOP_TIP);
const branchAvailable = gitAvailable() && exists(PHASE2_TIP);

describe('G08: mapa de linajes de la fase OWASP', () => {
  it('declara las bases y los cierres que usan las pruebas, y 99 commits con ID único', () => {
    expect(map.version).toBe(1);
    expect(map.branch).toEqual({ base: PHASE2_BASE, tip: PHASE2_TIP });
    expect(map.develop).toEqual({ base: PHASE2_DEVELOP_BASE, tip: PHASE2_DEVELOP_TIP });
    expect(map.commits).toHaveLength(99);
    expect(new Set(map.commits.map((commit) => commit.id)).size).toBe(99);
    expect(map.commits[0].id).toBe('G01-C01');
    expect(map.commits.at(-1)).toMatchObject({ id: 'G08-C10', branch: PHASE2_TIP, develop: PHASE2_DEVELOP_TIP });
    for (const commit of map.commits) {
      expect(commit.id, commit.id).toMatch(/^G0\d-C\d{2}$/);
      for (const sha of [commit.branch, commit.develop, commit.patchId]) {
        expect(sha, commit.id).toMatch(/^[0-9a-f]{40}$/);
      }
      expect(commit.branch, commit.id).not.toBe(commit.develop);
    }
  });

  it('ningún hash aparece dos veces ni cruza de un linaje al otro', () => {
    const branch = map.commits.map((commit) => commit.branch);
    const develop = map.commits.map((commit) => commit.develop);
    expect(new Set([...branch, ...develop]).size).toBe(198);
    expect(new Set(map.commits.map((commit) => commit.patchId)).size).toBe(99);
  });

  it('cada fila con hash del índice de evidencia es un commit del mapa con ese mismo ID', () => {
    const rows = [...index.matchAll(/^\| (G0\d-C\d{2}) \| `([0-9a-f]{8})` \|/gm)].map((match) => ({ id: match[1], sha: match[2] }));
    expect(rows.length).toBeGreaterThanOrEqual(98);
    for (const row of rows) {
      expect(map.commits.find((commit) => commit.branch.startsWith(row.sha))?.id, row.sha).toBe(row.id);
    }
  });

  it('un hash que el mapa no conoce no se traduce', () => {
    if (phaseLineage().name === 'develop') {
      expect(shaInLineage('deadbeef')).toBeUndefined();
      expect(shaInLineage(PHASE2_TIP.slice(0, 8))).toBe(PHASE2_DEVELOP_TIP);
    } else {
      expect(shaInLineage('deadbeef')).toBe('deadbeef');
    }
  });
});

describe.runIf(developAvailable)('G08: el linaje de develop es el que declara el mapa', () => {
  const range = `${PHASE2_DEVELOP_BASE}..${PHASE2_DEVELOP_TIP}`;

  it('el rango base..cierre son exactamente los 99 commits del mapa, en orden y sin merges', () => {
    expect(git('rev-list', '--reverse', range).split('\n')).toEqual(map.commits.map((commit) => commit.develop));
    expect(Number(git('rev-list', '--merges', '--count', range))).toBe(0);
    expect(git('rev-parse', `${PHASE2_DEVELOP_TIP}~99`)).toBe(PHASE2_DEVELOP_BASE);
  });

  it('cada commit lleva el ID que declara el mapa y su patch-id', () => {
    const ids = patchIds(range);
    for (const commit of map.commits) {
      expect(TRACE.exec(git('show', '-s', '--format=%B', commit.develop))?.[2], commit.develop).toBe(commit.id);
      expect(ids.get(commit.develop), commit.id).toBe(commit.patchId);
    }
  });

  it('la base y el cierre tienen los árboles que declara el mapa', () => {
    expect(git('rev-parse', `${PHASE2_DEVELOP_BASE}^{tree}`)).toBe(map.tree.base);
    expect(git('rev-parse', `${PHASE2_DEVELOP_TIP}^{tree}`)).toBe(map.tree.tip);
  });
});

describe.runIf(branchAvailable)('G08: el linaje de la rama auditada es el que declara el mapa', () => {
  const range = `${PHASE2_BASE}..${PHASE2_TIP}`;

  it('el rango base..cierre son exactamente los 99 commits del mapa, en orden, con su patch-id', () => {
    expect(git('rev-list', '--reverse', range).split('\n')).toEqual(map.commits.map((commit) => commit.branch));
    const ids = patchIds(range);
    for (const commit of map.commits) {
      expect(ids.get(commit.branch), commit.id).toBe(commit.patchId);
    }
  });

  it('la base y el cierre tienen los mismos árboles que en develop', () => {
    expect(git('rev-parse', `${PHASE2_BASE}^{tree}`)).toBe(map.tree.base);
    expect(git('rev-parse', `${PHASE2_TIP}^{tree}`)).toBe(map.tree.tip);
  });
});

describe.runIf(developAvailable && branchAvailable)('G08: los dos linajes son el mismo trabajo', () => {
  it('cada par tiene el mismo autor, fecha de autor, committer y mensaje', () => {
    const meta = (range: string) => git('log', '--reverse', '--format=%an <%ae>|%ad|%cn <%ce>|%B%x1e', range).split('\x1e').map((entry) => entry.trim());
    expect(meta(`${PHASE2_DEVELOP_BASE}..${PHASE2_DEVELOP_TIP}`)).toEqual(meta(`${PHASE2_BASE}..${PHASE2_TIP}`));
  });
});
