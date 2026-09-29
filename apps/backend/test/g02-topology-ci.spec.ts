import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './helpers/gha-expression';
import { loadWorkflow, readRepoFile } from './helpers/workflow-yaml';
// Filtro sin dependencias que ejecuta el propio job de CI.
import { shouldRunHarness, touchesTopology } from '../../../infra/staging/should-run.mjs';

/**
 * G02-C18 · OWASP25-C043/C044 + D4. El arnés de topología es un gate
 * determinista antes de main: siempre en PR → main, en PR → develop solo si el
 * cambio lo afecta, a mano con dispatch, y nunca dentro del workflow_call del
 * deploy. El job no publica, no despliega ni usa secretos.
 */

const ci = loadWorkflow('ci.yml');
/** Checks requeridos futuros (mismo contrato que g02-ci-quality-gates.spec.ts). */
const STABLE_JOB_NAMES: Record<string, string> = {
  backend: 'Backend - lint y pruebas',
  frontend: 'Frontend - lint y pruebas',
  e2e: 'E2E - suite de humo (Playwright)',
};
const topology = ci.jobs.topology;

interface Trigger {
  event: string;
  baseRef?: string;
  inputs?: Record<string, string>;
}

const jobRuns = ({ event, baseRef = '', inputs = {} }: Trigger) =>
  evaluateExpression(topology.if ?? 'false', { github: { event_name: event, base_ref: baseRef }, inputs });

describe('G02-C18: disparo del job de topología', () => {
  it.each<[string, Trigger, boolean]>([
    ['PR hacia main', { event: 'pull_request', baseRef: 'main' }, true],
    ['PR hacia develop (decide el filtro de rutas)', { event: 'pull_request', baseRef: 'develop' }, true],
    ['workflow_dispatch directo', { event: 'workflow_dispatch' }, true],
    ['push a develop', { event: 'push' }, false],
    ['workflow_call del deploy por push a main', { event: 'push', inputs: { e2e: 'run' } }, false],
    ['workflow_call del deploy por dispatch (el evento del caller no se filtra)', { event: 'workflow_dispatch', inputs: { e2e: 'run' } }, false],
  ])('%s → job %s', (_caso, trigger, expected) => {
    expect(jobRuns(trigger)).toBe(expected);
  });

  it.each<[string, Parameters<typeof shouldRunHarness>[0], boolean]>([
    ['dispatch', { eventName: 'workflow_dispatch', baseRef: '', changedFiles: [] }, true],
    ['PR a main sin archivos relevantes', { eventName: 'pull_request', baseRef: 'main', changedFiles: ['README.md'] }, true],
    ['PR a develop solo de docs', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['docs/a.md', 'apps/frontend/app/page.tsx'] }, false],
    ['PR a develop que toca nginx', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['infra/nginx/sites-enabled/uvg-collab'] }, true],
    ['PR a develop que toca el arnés', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['infra/staging/characterize.mjs'] }, true],
    ['PR a develop que toca un gateway', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['apps/backend/src/chat/chat.gateway.ts'] }, true],
    ['PR a develop que toca cabeceras (Helmet)', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['apps/backend/src/main.ts'] }, true],
    ['PR a develop que toca next.config', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['apps/frontend/next.config.ts'] }, true],
    ['PR a develop que toca el hook realtime', { eventName: 'pull_request', baseRef: 'develop', changedFiles: ['apps/frontend/lib/hooks/useRealtimeNotifications.ts'] }, true],
    ['PR a develop con diff no calculable (fail-closed)', { eventName: 'pull_request', baseRef: 'develop', changedFiles: null }, true],
    ['push', { eventName: 'push', baseRef: '', changedFiles: ['infra/nginx/x'] }, false],
  ])('filtro: %s → %s', (_caso, input, expected) => {
    expect(shouldRunHarness(input)).toBe(expected);
  });

  it('un servicio de chat que no es gateway ni módulo no dispara el arnés en develop', () => {
    expect(touchesTopology(['apps/backend/src/chat/chat.service.ts'])).toBe(false);
  });
});

describe('G02-C18: el job no publica, no despliega y no alcanza producción', () => {
  const steps = topology.steps ?? [];
  const runs = steps.map((step) => step.run ?? '').join('\n');

  it('solo ejecuta el filtro, el guard y el ciclo efímero del arnés', () => {
    expect(steps.filter((step) => step.run).map((step) => step.run?.trim())).toEqual([
      'node infra/staging/should-run.mjs >> "$GITHUB_OUTPUT"',
      'node infra/staging/check-representativity.mjs',
      'infra/staging/run-harness.sh',
    ]);
    for (const step of steps.slice(3)) {
      expect((step as { if?: string }).if).toBe("steps.scope.outputs.run == 'true'");
    }
  });

  it('sin acciones de login/publicación, sin secretos y sin escritura en el token', () => {
    const uses = steps.map((step) => step.uses).filter(Boolean);
    expect(uses).toEqual(['actions/checkout@v4', 'actions/setup-node@v4']);
    expect(JSON.stringify(topology)).not.toMatch(/secrets\.|docker push|docker\/login-action|build-push-action|ssh|appleboy/);
    expect(topology.permissions).toBeUndefined();
    expect(ci.permissions).toEqual({ contents: 'read' });
    expect(runs).not.toMatch(/158\.23\.57\.118|nip\.io/);
  });

  it('el ciclo del arnés solo publica puertos locales y destruye todo al terminar', () => {
    expect(readRepoFile('infra/staging/docker-compose.yml')).not.toMatch(/0\.0\.0\.0|image: ghcr\.io/);
    expect(readRepoFile('infra/staging/run-harness.sh')).toContain('down -v --remove-orphans --rmi local');
  });

  it('los nombres de job existentes no cambian y el nuevo job tiene nombre propio', () => {
    for (const [id, name] of Object.entries(STABLE_JOB_NAMES)) {
      expect(ci.jobs[id].name).toBe(name);
    }
    expect(topology.name).toBe('Topologia - arnes efimero (nginx + TLS)');
  });
});
