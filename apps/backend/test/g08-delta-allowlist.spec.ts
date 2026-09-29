import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';
import { PHASE2_BASE, gitAvailable } from './helpers/owasp-evidence';

/**
 * G08-C02 · OWASP25-C048 (A08:2025). Allowlist declarativa del delta de la
 * rama OWASP: rutas exactas con el gate que puede tocarlas, más patrones
 * acotados solo para los tests de G08. La base es el padre local del primer
 * commit de G01 (BASE_SHA_PHASE2_CODE), no `main` ni una release. Se prueba
 * contra el historial local: cada ruta del delta está declarada y ningún gate
 * figura en una ruta que no tocó (salvo lo que G08 declara de antemano).
 */

interface Allowlist {
  version: number;
  baseSha: string;
  branch: string;
  gates: string[];
  notExecuted: Array<{ id: string; status: string; reason: string }>;
  paths: Array<{ path: string; gates: string[] }>;
  patterns: Array<{ glob: string; gates: string[]; reason: string }>;
  exceptions: Array<{ path: string; gates: string[]; reason: string }>;
}

const allowlist = JSON.parse(readRepoFile('docs/security/owasp-delta-allowlist.json')) as Allowlist;

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split('**')
    .map((part) => part.split('*').map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

export function coveringGates(list: Pick<Allowlist, 'paths' | 'patterns' | 'exceptions'>, path: string): string[] {
  const gates = new Set<string>();
  for (const entry of [...list.paths, ...list.exceptions]) {
    if (entry.path === path) entry.gates.forEach((gate) => gates.add(gate));
  }
  for (const entry of list.patterns) {
    if (globToRegExp(entry.glob).test(path)) entry.gates.forEach((gate) => gates.add(gate));
  }
  return [...gates];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/** Ruta → gates que la tocaron, según los commits trazables del historial local. */
function gatesByPathInHistory(): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  for (const sha of git('rev-list', '--no-merges', `${PHASE2_BASE}..HEAD`).split('\n').filter(Boolean)) {
    const gate = /Security\/integration contract: Gate (G0\d) · Commit/.exec(git('show', '-s', '--format=%B', sha))?.[1];
    for (const path of git('diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', sha).split('\n').filter(Boolean)) {
      if (!byPath.has(path)) byPath.set(path, new Set());
      if (gate) byPath.get(path)?.add(gate);
    }
  }
  return byPath;
}

describe('G08-C02: allowlist del delta OWASP', () => {
  it('es JSON parseable con la base de la fase, la rama y los gates de la workstream', () => {
    expect(allowlist.version).toBe(1);
    expect(allowlist.baseSha).toBe(PHASE2_BASE);
    expect(allowlist.branch).toBe('sprint8/vernel-owasp2025');
    expect(allowlist.gates).toEqual(['G01', 'G02', 'G03', 'G04', 'G06', 'G05', 'G07', 'G08']);
  });

  it('G02-C03 figura como no ejecutada (Gate Admin), nunca como commit', () => {
    expect(allowlist.notExecuted).toEqual([expect.objectContaining({ id: 'G02-C03', status: 'OUT_OF_SCOPE_ADMIN_HANDOFF' })]);
  });

  it('las rutas son relativas, únicas, ordenadas y solo nombran gates conocidos', () => {
    const paths = allowlist.paths.map((entry) => entry.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    expect(new Set(paths).size).toBe(paths.length);
    for (const entry of allowlist.paths) {
      expect(entry.path).not.toMatch(/^\/|(^|\/)\.\.(\/|$)/);
      expect(entry.gates.length).toBeGreaterThan(0);
      expect(entry.gates.every((gate) => allowlist.gates.includes(gate))).toBe(true);
    }
  });

  it('los patrones son acotados, justificados y solo cubren tests de G08; no hay excepciones abiertas', () => {
    for (const pattern of allowlist.patterns) {
      expect(pattern.reason.length).toBeGreaterThan(10);
      expect(pattern.glob).toMatch(/^apps\/backend\/test\/g08-[^/]*\.spec\.ts$/);
      expect(pattern.gates).toEqual(['G08']);
    }
    expect(allowlist.exceptions).toEqual([]);
  });

  it('fixture: una ruta funcional ajena no está cubierta', () => {
    expect(coveringGates(allowlist, 'apps/frontend/app/dashboard/nueva-funcionalidad/page.tsx')).toEqual([]);
    expect(coveringGates(allowlist, 'apps/backend/src/sprints/sprints.service.ts')).toEqual([]);
    expect(coveringGates(allowlist, 'apps/backend/test/g08-otra.spec.ts')).toEqual(['G08']);
    expect(coveringGates(allowlist, 'apps/backend/test/sub/g08-x.spec.ts')).toEqual([]);
  });

  it.runIf(gitAvailable())('cada ruta del delta base..HEAD está declarada', () => {
    const delta = git('diff', '--name-only', '--no-renames', PHASE2_BASE, 'HEAD').split('\n').filter(Boolean);
    expect(delta.filter((path) => coveringGates(allowlist, path).length === 0)).toEqual([]);
  });

  it.runIf(gitAvailable())('los gates de cada ruta son los que la tocaron; solo G08 puede declararse de antemano', () => {
    const history = gatesByPathInHistory();
    const findings: string[] = [];
    for (const entry of allowlist.paths) {
      const touched = history.get(entry.path) ?? new Set<string>();
      for (const gate of touched) {
        if (!entry.gates.includes(gate)) findings.push(`falta ${gate} en ${entry.path}`);
      }
      for (const gate of entry.gates) {
        if (!touched.has(gate) && gate !== 'G08') findings.push(`${gate} declarado sin tocar ${entry.path}`);
      }
    }
    expect(findings).toEqual([]);
  });
});
