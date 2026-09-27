import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Lectura de archivos del repositorio y de workflows de GitHub Actions para los
 * tests de contrato de G01. js-yaml llega fijado por el lockfile del backend
 * (dependencia de @nestjs/cli); si dejara de resolverse, estos tests fallan en
 * lugar de omitirse en silencio.
 */

const loadModule = createRequire(__filename);
const yaml = loadModule('js-yaml') as { load: (source: string) => unknown };

export const REPO_ROOT = join(__dirname, '../../../..');

export function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

export interface WorkflowStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

export interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  uses?: string;
  env?: Record<string, string>;
  steps?: WorkflowStep[];
}

export interface Workflow {
  env?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

export function parseWorkflow(source: string): Workflow {
  const parsed = yaml.load(source);
  if (typeof parsed !== 'object' || parsed === null || !('jobs' in parsed)) {
    throw new Error('El workflow no es un documento YAML con jobs');
  }
  return parsed as Workflow;
}

export function loadWorkflow(fileName: string): Workflow {
  return parseWorkflow(readRepoFile(join('.github/workflows', fileName)));
}

export function findStep(job: WorkflowJob, predicate: (step: WorkflowStep) => boolean): WorkflowStep {
  const step = (job.steps ?? []).find(predicate);
  if (!step) {
    throw new Error('Paso no encontrado en el job');
  }
  return step;
}
