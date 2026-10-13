#!/usr/bin/env node
/**
 * Decide si el deploy a produccion (deploy.yml) debe pedirle el E2E a ci.yml
 * o puede omitirlo porque el mismo arbol de archivos ya lo paso, con exito,
 * en el PR hacia main que genero este commit (G02-C13, extension FASE-CI01).
 *
 *   GH_TOKEN=... node .github/scripts/decide-e2e.mjs
 *
 * Fail-closed: cualquier duda (sin PR asociado, API caida, arboles distintos,
 * E2E sin exito) => 'run'. Solo se omite cuando se puede demostrar que este
 * commit es exactamente el contenido que un PR hacia main ya probo con el
 * E2E en success. `workflow_dispatch` siempre corre, sin consultar nada.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED_CHECK_NAME = 'E2E - suite de humo (Playwright)';

/**
 * Logica pura: nada de red aqui, solo las decisiones. Los `fetch*` son
 * inyectados para poder probar cada rama sin llamar a GitHub.
 *
 * @param {{
 *   eventName: string,
 *   currentSha: string,
 *   fetchPrForCommit: () => { number: number, headSha: string } | null,
 *   fetchCommitTree: (sha: string) => string | null,
 *   fetchE2eConclusion: (headSha: string) => string | null,
 * }} deps
 * @returns {{ e2e: 'run' | 'skip', reason: string }}
 */
export function decideE2e({ eventName, currentSha, fetchPrForCommit, fetchCommitTree, fetchE2eConclusion }) {
  if (eventName === 'workflow_dispatch') {
    return { e2e: 'run', reason: 'workflow_dispatch siempre corre el E2E' };
  }

  const pr = fetchPrForCommit();
  if (!pr) {
    return { e2e: 'run', reason: 'ningun PR mergeado hacia main esta asociado a este commit' };
  }

  const currentTree = fetchCommitTree(currentSha);
  const testedTree = fetchCommitTree(pr.headSha);
  if (!currentTree || !testedTree || currentTree !== testedTree) {
    return { e2e: 'run', reason: `el arbol del commit no coincide con el que probo el PR #${pr.number}` };
  }

  const conclusion = fetchE2eConclusion(pr.headSha);
  if (conclusion !== 'success') {
    return { e2e: 'run', reason: `el E2E del PR #${pr.number} no termino en success (fue: ${conclusion ?? 'ninguno'})` };
  }

  return { e2e: 'skip', reason: `el PR #${pr.number} hacia main probo este mismo arbol con el E2E en success` };
}

/** Filtro jq con guarda contra `last` vacio: nunca indexa null. */
function ghApi(path, jqFilter) {
  const result = spawnSync('gh', ['api', path, '--jq', jqFilter], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) return null;
  const out = result.stdout.trim();
  return out === '' ? null : out;
}

function fetchPrForCommitViaApi(repo, sha) {
  const out = ghApi(
    `repos/${repo}/commits/${sha}/pulls`,
    '[.[] | select(.base.ref == "main" and .merged_at != null)] | sort_by(.merged_at) | last | if . == null then null else {number, headSha: .head.sha} end',
  );
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    return parsed && parsed.number ? parsed : null;
  } catch {
    return null;
  }
}

function fetchCommitTreeViaApi(repo, sha) {
  return ghApi(`repos/${repo}/commits/${sha}`, '.commit.tree.sha // ""') || null;
}

function fetchE2eConclusionViaApi(repo, headSha) {
  return (
    ghApi(
      `repos/${repo}/commits/${headSha}/check-runs`,
      `[.check_runs[] | select(.name == "${REQUIRED_CHECK_NAME}")] | sort_by(.started_at) | last | if . == null then "" else (.conclusion // "") end`,
    ) || null
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (!repo || !sha || !eventName) {
    console.error('decide-e2e: faltan GITHUB_REPOSITORY, GITHUB_SHA o GITHUB_EVENT_NAME');
    process.exit(1);
  }

  const { e2e, reason } = decideE2e({
    eventName,
    currentSha: sha,
    fetchPrForCommit: () => fetchPrForCommitViaApi(repo, sha),
    fetchCommitTree: (commitSha) => fetchCommitTreeViaApi(repo, commitSha),
    fetchE2eConclusion: (headSha) => fetchE2eConclusionViaApi(repo, headSha),
  });

  console.log(`decide-e2e: ${reason} -> e2e=${e2e}`);
  if (!process.env.GITHUB_OUTPUT) {
    console.error('decide-e2e: GITHUB_OUTPUT no esta definido');
    process.exit(1);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `e2e=${e2e}\n`);
}
