#!/usr/bin/env node
/**
 * Orquesta un escenario de k6/scenarios/*.js con cero configuración manual:
 *
 *   1. Asegura (idempotente) el fixture dedicado de k6 vía
 *      prisma/seed-k6-fixture.ts — usuario líder, usuario listener, proyecto
 *      propio con participación ACTIVO y Sprint ACTIVO (namespace k6.*, ver
 *      ese archivo para el detalle).
 *   2. Lee los ids reales que ese script imprime por stdout (Postgres los
 *      asigna, nunca se fijan a mano).
 *   3. Invoca `k6 run` con las variables -e que cada escenario necesita ya
 *      resueltas.
 *
 * Uso:
 *   node scripts/run-k6.js project-listing
 *   node scripts/run-k6.js kanban-operations
 *   node scripts/run-k6.js socket-io                 (solo conexión, sin mutar nada)
 *   node scripts/run-k6.js socket-io --trigger        (finaliza el Sprint fixture)
 *
 * Cualquier argumento extra se reenvía tal cual a `k6 run` al final, así que
 * se puede seguir ajustando manualmente si hace falta, p. ej.:
 *   node scripts/run-k6.js kanban-operations -e K6_ITERATIONS=5
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_DIR, '..', '..');
const K6_DIR = path.join(REPO_ROOT, 'k6');

const SCENARIOS = {
  'project-listing': 'scenarios/project-listing.js',
  'kanban-operations': 'scenarios/kanban-operations.js',
  'socket-io': 'scenarios/socket-io.js',
};

const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/uvg_collab?schema=public';
const DEFAULT_BASE_URL = 'http://localhost:3001';

function usageAndExit() {
  console.error(`Uso: node scripts/run-k6.js <${Object.keys(SCENARIOS).join('|')}> [--trigger] [-- extra k6 args]`);
  process.exit(1);
}

function loadRootEnvFile(env) {
  // Best-effort: si no hay .env en la raíz del repo (docker-compose.yml lo
  // usa vía env_file), no falla — simplemente no aporta variables nuevas.
  try {
    require('dotenv').config({ path: path.join(REPO_ROOT, '.env'), processEnv: env });
  } catch {
    // dotenv siempre está disponible (dependencia de apps/backend), pero si
    // el archivo no existe simplemente no cambia nada.
  }
}

function runFixture(env) {
  const result = spawnSync('npx', ['tsx', 'prisma/seed-k6-fixture.ts'], {
    cwd: BACKEND_DIR,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    console.error('\n[run-k6] No se pudo preparar el fixture de k6 (prisma/seed-k6-fixture.ts).');
    process.exit(result.status ?? 1);
  }

  const lines = result.stdout.trim().split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch {
    console.error('[run-k6] La salida del fixture no fue JSON válido:\n' + result.stdout);
    process.exit(1);
  }
}

function main() {
  const [scenarioArg, ...rest] = process.argv.slice(2);
  const scenarioPath = SCENARIOS[scenarioArg];
  if (!scenarioPath) usageAndExit();

  const triggerIndex = rest.indexOf('--trigger');
  const trigger = triggerIndex !== -1;
  if (trigger) rest.splice(triggerIndex, 1);

  if (trigger && scenarioArg !== 'socket-io') {
    console.error('[run-k6] --trigger solo aplica al escenario socket-io.');
    process.exit(1);
  }

  const env = { ...process.env };
  loadRootEnvFile(env);
  if (!env.DATABASE_URL) env.DATABASE_URL = DEFAULT_LOCAL_DATABASE_URL;
  if (!env.DIRECT_URL) env.DIRECT_URL = env.DATABASE_URL;
  const baseUrl = env.K6_BASE_URL || DEFAULT_BASE_URL;

  console.log('[run-k6] Preparando fixture (usuarios, proyecto, Sprint ACTIVO)...');
  const fixture = runFixture(env);

  const k6Env = {
    K6_BASE_URL: baseUrl,
    K6_USER_EMAIL: fixture.email,
    K6_USER_PASSWORD: fixture.password,
  };

  if (scenarioArg === 'kanban-operations') {
    k6Env.K6_PROJECT_ID = String(fixture.projectId);
    k6Env.K6_USER_ID = String(fixture.userId);
  }

  if (scenarioArg === 'socket-io' && trigger) {
    k6Env.K6_TRIGGER_SPRINT_FINALIZATION = 'true';
    k6Env.K6_PROJECT_ID = String(fixture.projectId);
    k6Env.K6_SPRINT_ID = String(fixture.sprintId);
    k6Env.K6_SOCKET_LISTENER_EMAIL = fixture.listenerEmail;
    k6Env.K6_SOCKET_LISTENER_PASSWORD = fixture.listenerPassword;
  }

  const k6Args = ['run', ...Object.entries(k6Env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), ...rest, scenarioPath];

  console.log(`[run-k6] k6 run ${scenarioPath}${trigger ? ' (--trigger)' : ''}`);
  const k6Result = spawnSync('k6', k6Args, {
    cwd: K6_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  process.exit(k6Result.status ?? 1);
}

main();
