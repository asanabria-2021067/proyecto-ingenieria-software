import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';

/**
 * G03-C03 · OWASP25-C042. Dependabot propone actualizaciones controladas
 * (semanal, agrupadas, con límite y sin majors) que siempre pasan por revisión
 * humana: ningún workflow las auto-aprueba ni auto-mergea. Su activación en
 * GitHub es del Gate Admin, no de este test.
 */

const yaml = createRequire(__filename)('js-yaml') as { load: (source: string) => unknown };

interface DependabotUpdate {
  'package-ecosystem': string;
  directory: string;
  'target-branch'?: string;
  schedule?: { interval?: string };
  'open-pull-requests-limit'?: number;
  groups?: Record<string, { 'update-types'?: string[] }>;
  ignore?: { 'dependency-name': string; 'update-types'?: string[] }[];
}

const MAJOR = 'version-update:semver-major';
const EXPECTED = [
  ['npm', '/apps/backend'],
  ['npm', '/apps/frontend'],
  ['github-actions', '/'],
];

export function updateFindings(update: DependabotUpdate): string[] {
  const id = `${update['package-ecosystem']}:${update.directory}`;
  const findings: string[] = [];
  if (update.schedule?.interval !== 'weekly') {
    findings.push(`${id}:no-semanal`);
  }
  const limit = update['open-pull-requests-limit'];
  if (limit === undefined || limit < 1 || limit > 5) {
    findings.push(`${id}:limite-de-prs`);
  }
  if (!Object.values(update.groups ?? {}).some((group) => group['update-types']?.includes('patch'))) {
    findings.push(`${id}:sin-agrupar`);
  }
  if (!(update.ignore ?? []).some((rule) => rule['dependency-name'] === '*' && rule['update-types']?.includes(MAJOR))) {
    findings.push(`${id}:majors-no-ignorados`);
  }
  return findings;
}

/** Un workflow que auto-apruebe o auto-mergee PRs de Dependabot rompe la revisión humana. */
export function autoMergeFindings(workflows: Record<string, string>): string[] {
  return Object.entries(workflows)
    .filter(([, source]) => /dependabot\/fetch-metadata|merge\s+--auto|--auto\b.*merge|enablePullRequestAutoMerge|pr review\s+--approve/i.test(source))
    .map(([name]) => `auto-merge:${name}`);
}

const config = yaml.load(readRepoFile('.github/dependabot.yml')) as { version: number; updates: DependabotUpdate[] };
const workflowsDir = join(REPO_ROOT, '.github/workflows');
const workflows = Object.fromEntries(
  readdirSync(workflowsDir).map((file) => [file, readRepoFile(join('.github/workflows', file))]),
);

describe('G03-C03: Dependabot controlado y sin auto-merge', () => {
  it('YAML válido v2 con npm backend, npm frontend y github-actions', () => {
    expect(config.version).toBe(2);
    expect(config.updates.map((u) => [u['package-ecosystem'], u.directory])).toEqual(EXPECTED);
  });

  it('cada directorio existe y tiene el manifiesto de su ecosistema', () => {
    for (const update of config.updates) {
      const dir = join(REPO_ROOT, update.directory);
      if (update['package-ecosystem'] === 'npm') {
        expect(existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'package-lock.json'))).toBe(true);
      } else {
        expect(existsSync(join(dir, '.github/workflows'))).toBe(true);
      }
    }
  });

  it('semanal, agrupado, con límite de PRs, majors ignorados y hacia develop', () => {
    expect(config.updates.flatMap(updateFindings)).toEqual([]);
    expect(config.updates.every((u) => u['target-branch'] === 'develop')).toBe(true);
  });

  it('ningún workflow auto-aprueba ni auto-mergea PRs', () => {
    expect(autoMergeFindings(workflows)).toEqual([]);
  });

  describe('fixtures negativos', () => {
    it('diario, sin límite, sin grupo y con majors', () => {
      expect(updateFindings({ 'package-ecosystem': 'npm', directory: '/x', schedule: { interval: 'daily' } })).toEqual([
        'npm:/x:no-semanal',
        'npm:/x:limite-de-prs',
        'npm:/x:sin-agrupar',
        'npm:/x:majors-no-ignorados',
      ]);
    });

    it('un workflow de auto-merge de Dependabot', () => {
      expect(
        autoMergeFindings({
          'automerge.yml': 'steps:\n  - uses: dependabot/fetch-metadata@v2\n  - run: gh pr merge --auto --squash "$PR_URL"\n',
        }),
      ).toEqual(['auto-merge:automerge.yml']);
    });
  });
});
