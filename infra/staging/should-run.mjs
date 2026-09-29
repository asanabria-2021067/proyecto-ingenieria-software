#!/usr/bin/env node
/**
 * Decide si el arnés de topología corre en esta ejecución de CI (G02-C18).
 *
 *   workflow_dispatch      -> siempre
 *   pull_request -> main   -> siempre (CI_PR_MAIN)
 *   pull_request -> develop-> solo si el PR toca realtime, nginx, cabeceras,
 *                             la topología (Dockerfiles/compose) o el propio arnés
 *   cualquier otro evento  -> no
 *
 * Si no se puede calcular el diff del PR, corre (fail-closed).
 * Escribe `run=true|false` en stdout (formato de $GITHUB_OUTPUT).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RELEVANT_PATHS = [
  /^infra\/(nginx|staging)\//,
  /^\.github\/workflows\/ci\.yml$/,
  /^docker-compose\.yml$/,
  /^apps\/(backend|frontend)\/Dockerfile$/,
  /^apps\/backend\/src\/main\.ts$/,
  /^apps\/backend\/src\/(chat|notifications)\/[^/]*\.(gateway|module)\.ts$/,
  /^apps\/frontend\/(next\.config\.ts|middleware\.ts)$/,
  /^apps\/frontend\/hooks\/use-chat\.ts$/,
  /^apps\/frontend\/lib\/hooks\/useRealtimeNotifications\.ts$/,
];

export function touchesTopology(changedFiles) {
  return changedFiles.some((file) => RELEVANT_PATHS.some((pattern) => pattern.test(file)));
}

/** changedFiles = null cuando no se pudo calcular el diff. */
export function shouldRunHarness({ eventName, baseRef, changedFiles }) {
  if (eventName === 'workflow_dispatch') {
    return true;
  }
  if (eventName !== 'pull_request') {
    return false;
  }
  if (baseRef === 'main') {
    return true;
  }
  if (changedFiles === null) {
    return true;
  }
  return touchesTopology(changedFiles);
}

function changedFilesOfPullRequest() {
  try {
    // En pull_request, actions/checkout deja el merge commit: HEAD^1 es la punta de la base.
    const output = execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { encoding: 'utf8' });
    return output.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const eventName = process.env.EVENT_NAME ?? '';
  const baseRef = process.env.BASE_REF ?? '';
  const needsDiff = eventName === 'pull_request' && baseRef !== 'main';
  const run = shouldRunHarness({ eventName, baseRef, changedFiles: needsDiff ? changedFilesOfPullRequest() : [] });
  console.log(`run=${run}`);
}
