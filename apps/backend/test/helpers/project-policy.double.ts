import { vi } from 'vitest';
import { EstadoProyecto } from '@prisma/client';
import type { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import type { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import {
  EffectBuffer,
  type ProjectLockRow,
  type ProjectRunOptions,
  type ProjectTransactionContext,
  type ProjectTransactionService,
} from '../../src/common/project-policy/project-transaction.service';

/**
 * Dobles del protocolo transaccional de Sprint 7 para pruebas unitarias con
 * Prisma mockeado. `makeProjectTransactionDouble` reproduce el contrato de
 * `ProjectTransactionService.run`: entrega `tx`, la fila del proyecto
 * (sintética o resuelta por el caller), un `EffectBuffer` por intento y
 * publica los efectos SOLO después de que el callback resuelve; si el
 * callback lanza, los efectos se descartan. Los dobles de policy son
 * no-op salvo que la prueba los configure.
 */
export interface ProjectTransactionDoubleOptions {
  /** Cliente que recibe el callback como `tx` (normalmente el doble de Prisma o su `tx`). */
  tx: unknown;
  /** Fila del proyecto bloqueado; por defecto una fila sintética con el id solicitado. */
  project?: Partial<ProjectLockRow> | ((projectId: number) => ProjectLockRow | null);
}

export type ProjectTransactionDouble = ProjectTransactionService & {
  run: ReturnType<typeof vi.fn>;
  lockProjectTx: ReturnType<typeof vi.fn>;
  published: unknown[][];
};

export function makeProjectTransactionDouble(options: ProjectTransactionDoubleOptions): ProjectTransactionDouble {
  const published: unknown[][] = [];
  const resolveProject = (projectId: number): ProjectLockRow | null => {
    if (typeof options.project === 'function') {
      return options.project(projectId);
    }
    return {
      idProyecto: projectId,
      creadoPor: 0,
      estadoProyecto: 'BORRADOR',
      eliminadoEn: null,
      ...(options.project ?? {}),
    } as ProjectLockRow;
  };

  const run = vi.fn(
    async (
      projectId: number | null,
      actorId: number,
      operation: string,
      callback: (ctx: ProjectTransactionContext) => Promise<unknown>,
      runOptions: ProjectRunOptions = {},
    ) => {
      const effects = new EffectBuffer();
      const project = runOptions.createsProject ? null : resolveProject(projectId as number);
      const result = await callback({
        tx: options.tx as ProjectTransactionContext['tx'],
        project,
        effects,
        attempt: 1,
        actorId,
        operation,
      });
      const pending = effects.drain();
      published.push(pending);
      if (runOptions.publish) {
        await runOptions.publish(pending);
      } else {
        for (const effect of pending) {
          await effect.publish();
        }
      }
      return result;
    },
  );

  return { run, lockProjectTx: vi.fn(), published } as unknown as ProjectTransactionDouble;
}

export type ProjectPolicyDouble = ProjectPolicyService & {
  assertWriteTx: ReturnType<typeof vi.fn>;
  assertEntitySprintTx: ReturnType<typeof vi.fn>;
  assertAdminTx: ReturnType<typeof vi.fn>;
  assertProjectState: ReturnType<typeof vi.fn>;
  assertEnvironmentTx: ReturnType<typeof vi.fn>;
};

export function makeProjectPolicyDouble(): ProjectPolicyDouble {
  return {
    assertWriteTx: vi.fn().mockResolvedValue(undefined),
    assertEntitySprintTx: vi.fn().mockResolvedValue(undefined),
    assertAdminTx: vi.fn().mockResolvedValue(undefined),
    assertProjectState: vi.fn(),
    assertEnvironmentTx: vi.fn().mockResolvedValue(undefined),
    assertEnvironmentState: vi.fn(),
    assertEntitySprintState: vi.fn(),
    assertActorTx: vi.fn().mockResolvedValue(undefined),
    policyFor: vi.fn(),
    resolveProjectId: vi.fn(),
  } as unknown as ProjectPolicyDouble;
}

export type ProjectReadPolicyDouble = ProjectReadPolicyService & {
  assertRead: ReturnType<typeof vi.fn>;
  scopeForActor: ReturnType<typeof vi.fn>;
};

export function makeProjectReadPolicyDouble(): ProjectReadPolicyDouble {
  return {
    assertRead: vi.fn().mockResolvedValue({ profile: 'LIDER', sprintEstados: null, ownOnly: false, isAdmin: false }),
    scopeForActor: vi.fn().mockReturnValue({ sprintWhere: {}, ownOnly: false }),
  } as unknown as ProjectReadPolicyDouble;
}

/**
 * C040: añade a un `tx` simulado las dos sentencias que
 * `ProjectTransactionService.run` ejecuta antes del callback (`SET LOCAL
 * lock_timeout` y el `UPDATE … RETURNING` del lock del proyecto), para poder
 * usar el runner REAL sobre un `$transaction` mockeado y conservar intactas
 * las aserciones existentes sobre `$transaction`.
 */
export function withProjectLock<T extends object>(
  tx: T,
  project: Partial<ProjectLockRow> = {},
): T & { $executeRawUnsafe: ReturnType<typeof vi.fn>; $queryRaw: ReturnType<typeof vi.fn> } {
  const row: ProjectLockRow = {
    idProyecto: 0,
    creadoPor: 0,
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    eliminadoEn: null,
    ...project,
  };
  return Object.assign(tx, {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([row]),
  });
}
