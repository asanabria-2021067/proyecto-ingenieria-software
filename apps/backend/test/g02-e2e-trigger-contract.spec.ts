import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './helpers/gha-expression';
import { loadWorkflow } from './helpers/workflow-yaml';

/**
 * G02-C13 · OWASP25-C033 + FASE2-N06. El E2E del workflow reutilizable se
 * decide con un input explícito del caller, no con `github.event_name` (que en
 * un workflow_call es el evento del caller). Se evalúa el `if:` real de ci.yml
 * para cada forma de disparo.
 */

const ci = loadWorkflow('ci.yml');
const deploy = loadWorkflow('deploy.yml');
const e2eCondition = () => {
  const condition = ci.jobs.e2e.if;
  if (!condition) {
    throw new Error('El job e2e no tiene condición');
  }
  return condition;
};

interface Trigger {
  event: string;
  baseRef?: string;
  inputs?: Record<string, string>;
}

const runsE2E = ({ event, baseRef = '', inputs = {} }: Trigger) =>
  evaluateExpression(e2eCondition(), { github: { event_name: event, base_ref: baseRef }, inputs });

describe('G02-C13: E2E del reusable por input explícito', () => {
  it.each<[string, Trigger, boolean]>([
    ['PR hacia develop', { event: 'pull_request', baseRef: 'develop' }, false],
    ['PR hacia main', { event: 'pull_request', baseRef: 'main' }, true],
    ['push a develop', { event: 'push' }, false],
    ['workflow_dispatch directo de ci.yml', { event: 'workflow_dispatch' }, true],
    ['workflow_call del deploy por push a main', { event: 'push', inputs: { e2e: 'run' } }, true],
    ['workflow_call del deploy por dispatch', { event: 'workflow_dispatch', inputs: { e2e: 'run' } }, true],
    ['workflow_call que pide skip (el evento del caller no se filtra)', { event: 'workflow_dispatch', inputs: { e2e: 'skip' } }, false],
    ['workflow_call que pide skip desde un PR a main del caller', { event: 'pull_request', baseRef: 'main', inputs: { e2e: 'skip' } }, false],
  ])('%s → E2E %s', (_caso, trigger, expected) => {
    expect(runsE2E(trigger)).toBe(expected);
  });

  it('el reusable declara el input como obligatorio (el caller siempre decide)', () => {
    const callInputs = (ci as unknown as { on: { workflow_call: { inputs: Record<string, unknown> } } }).on
      .workflow_call.inputs;
    expect(callInputs.e2e).toMatchObject({ type: 'string', required: true });
  });

  it('deploy.yml pide el E2E en todo deploy', () => {
    expect((deploy.jobs.test as { with?: Record<string, string> }).with).toEqual({ e2e: 'run' });
  });

  it('el evaluador rechaza construcciones que no entiende en lugar de inventar un resultado', () => {
    expect(() => evaluateExpression("github.event_name > 'a'", {})).toThrow();
  });

  it('fixture: la condición antigua basada en el evento omite el E2E en el deploy por push a main', () => {
    const legacy =
      "github.event_name == 'workflow_call' || github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main')";
    expect(evaluateExpression(legacy, { github: { event_name: 'push', base_ref: '' }, inputs: { e2e: 'run' } })).toBe(
      false,
    );
  });
});
