import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EstadoProyecto, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sprint 7 (06 v2 §16/§40/§42): protocolo transaccional por proyecto.
 *
 * Toda escritura participante abre `run`, que:
 *  1. abre una transacción Prisma con aislamiento y timeouts explícitos
 *     (ReadCommitted, maxWait 5 s, timeout 15 s) y `SET LOCAL lock_timeout`;
 *  2. ejecuta como PRIMERA sentencia de dominio el UPDATE de la fila Proyecto
 *     con parámetro enlazado y RETURNING, que adquiere el lock de fila y deja
 *     `fechaActualizacion` como última actividad coordinada;
 *  3. valida `eliminadoEn` después del lock;
 *  4. entrega al callback el `tx`, la fila bloqueada y un buffer de efectos
 *     por intento (bitácora/notificaciones se PERSISTEN dentro del callback;
 *     sockets/correo/I/O externo se registran como efectos);
 *  5. publica los efectos SOLO después de que la transacción resuelva y los
 *     descarta en rollback.
 *
 * Modo `Serializable` acotado (únicamente `RolesService.leaveRole`): hasta
 * 3 intentos ante P2034/40001, reejecutando el callback completo, incluidos
 * todos los asserts y el UPDATE del padre; ningún resultado de autorización
 * se conserva entre intentos. No existe ningún otro reintento automático:
 * conflicto/timeout conocido → 409 PROYECTO_OCUPADO; indisponibilidad → 503.
 * Ningún I/O externo ocurre dentro del callback.
 */

export const PROJECT_TX_MAX_WAIT_MS = 5_000;
export const PROJECT_TX_TIMEOUT_MS = 15_000;
export const PROJECT_LOCK_TIMEOUT = '5s';
export const SERIALIZABLE_MAX_ATTEMPTS = 3;
export const PROJECT_BUSY_CODE = 'PROYECTO_OCUPADO';
export const PROJECT_BUSY_MESSAGE =
  'El proyecto está ocupado por otra operación; vuelve a intentarlo';

export type ProjectTransactionIsolation = 'ReadCommitted' | 'Serializable';

export interface ProjectLockRow {
  idProyecto: number;
  creadoPor: number;
  estadoProyecto: EstadoProyecto;
  eliminadoEn: Date | null;
}

/** Efecto diferido al post-commit: sockets, correo, invalidaciones. Nunca escrituras de dominio. */
export interface ProjectEffect {
  /** Clave de deduplicación dentro de la misma operación (p. ej. `notification:<userId>:<evento>`). */
  key?: string;
  publish: () => void | Promise<void>;
}

/**
 * Buffer de efectos por intento. Se crea vacío en cada intento del runner y
 * solo sobrevive si la transacción confirma.
 */
export class EffectBuffer {
  private readonly effects: ProjectEffect[] = [];
  private readonly keys = new Set<string>();

  add(effect: ProjectEffect): void {
    if (effect.key !== undefined) {
      if (this.keys.has(effect.key)) {
        return;
      }
      this.keys.add(effect.key);
    }
    this.effects.push(effect);
  }

  get size(): number {
    return this.effects.length;
  }

  drain(): ProjectEffect[] {
    const pending = this.effects.splice(0);
    this.keys.clear();
    return pending;
  }
}

export interface ProjectTransactionContext {
  tx: Prisma.TransactionClient;
  /** Fila del proyecto tomada por el UPDATE inicial; `null` solo con `createsProject`. */
  project: ProjectLockRow | null;
  effects: EffectBuffer;
  attempt: number;
  actorId: number;
  operation: string;
}

export interface ProjectRunOptions {
  isolation?: ProjectTransactionIsolation;
  /**
   * La operación inserta ella misma la fila Proyecto dentro del callback y
   * se considera adquirido el lock tras ese INSERT: no existe padre previo.
   */
  createsProject?: boolean;
  /** Publicador de efectos del caller (p. ej. `NotificationsService.publishEffects`). */
  publish?: (effects: ProjectEffect[]) => Promise<void> | void;
}

type PrismaErrorLike = { code?: string; meta?: { code?: unknown } };

function prismaCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }
  const candidate = error as PrismaErrorLike;
  return typeof candidate?.code === 'string' ? candidate.code : undefined;
}

function postgresCode(error: unknown): string | undefined {
  const candidate = error as PrismaErrorLike;
  const inner = candidate?.meta?.code;
  return typeof inner === 'string' ? inner : undefined;
}

/** P2034: conflicto de transacción (serialización/deadlock) reportado por Prisma. */
function isSerializationConflict(error: unknown): boolean {
  return prismaCode(error) === 'P2034' || postgresCode(error) === '40001';
}

/** Conflictos y timeouts conocidos de lock/transacción: el cliente relee y reintenta. */
function isKnownBusyConflict(error: unknown): boolean {
  const code = prismaCode(error);
  const pg = postgresCode(error);
  return (
    code === 'P2034' ||
    code === 'P2028' ||
    pg === '40001' ||
    pg === '40P01' ||
    pg === '55P03' ||
    pg === '57014'
  );
}

/** Indisponibilidad: sin conexión, pool agotado, servidor caído. */
function isUnavailability(error: unknown): boolean {
  const code = prismaCode(error);
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1008' ||
    code === 'P1017' ||
    code === 'P2024'
  );
}

@Injectable()
export class ProjectTransactionService {
  private readonly logger = new Logger(ProjectTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adquiere el lock del proyecto como primera sentencia de dominio de la
   * transacción recibida. Parámetro enlazado, nunca interpolado.
   */
  async lockProjectTx(tx: Prisma.TransactionClient, projectId: number): Promise<ProjectLockRow> {
    const rows = await tx.$queryRaw<ProjectLockRow[]>`
      UPDATE proyecto
      SET fecha_actualizacion = clock_timestamp()
      WHERE id_proyecto = ${projectId}
      RETURNING id_proyecto AS "idProyecto",
                creado_por AS "creadoPor",
                estado_proyecto AS "estadoProyecto",
                eliminado_en AS "eliminadoEn"
    `;
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    if (row.eliminadoEn !== null) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return row;
  }

  async run<T>(
    projectId: number | null,
    actorId: number,
    operation: string,
    callback: (ctx: ProjectTransactionContext) => Promise<T>,
    options: ProjectRunOptions = {},
  ): Promise<T> {
    const isolation = options.isolation ?? 'ReadCommitted';
    const maxAttempts = isolation === 'Serializable' ? SERIALIZABLE_MAX_ATTEMPTS : 1;
    const createsProject = options.createsProject === true;

    if (!createsProject && (projectId === null || !Number.isInteger(projectId))) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const effects = new EffectBuffer();
      let result: T;
      try {
        result = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${PROJECT_LOCK_TIMEOUT}'`);
            const project = createsProject ? null : await this.lockProjectTx(tx, projectId as number);
            return callback({ tx, project, effects, attempt, actorId, operation });
          },
          {
            maxWait: PROJECT_TX_MAX_WAIT_MS,
            timeout: PROJECT_TX_TIMEOUT_MS,
            isolationLevel:
              isolation === 'Serializable'
                ? Prisma.TransactionIsolationLevel.Serializable
                : Prisma.TransactionIsolationLevel.ReadCommitted,
          },
        );
      } catch (error) {
        // Rollback: el buffer de este intento se descarta íntegro.
        if (error instanceof HttpException) {
          throw error;
        }
        if (isolation === 'Serializable' && isSerializationConflict(error) && attempt < maxAttempts) {
          this.logger.debug(
            `${operation}: conflicto de serialización en el intento ${attempt}/${maxAttempts}; se reintenta`,
          );
          continue;
        }
        if (isKnownBusyConflict(error)) {
          throw new ConflictException({
            statusCode: 409,
            code: PROJECT_BUSY_CODE,
            message: PROJECT_BUSY_MESSAGE,
          });
        }
        if (isUnavailability(error)) {
          throw new ServiceUnavailableException(
            'La base de datos no está disponible; intenta de nuevo más tarde',
          );
        }
        throw error;
      }

      await this.publishEffects(effects.drain(), operation, options.publish);
      return result;
    }

    throw new ConflictException({
      statusCode: 409,
      code: PROJECT_BUSY_CODE,
      message: PROJECT_BUSY_MESSAGE,
    });
  }

  /**
   * Publicación post-commit, fuera del lock. Un fallo al publicar no
   * revierte nada: la base ya es correcta y el cliente recupera la bandeja
   * persistida.
   */
  private async publishEffects(
    effects: ProjectEffect[],
    operation: string,
    publish?: (effects: ProjectEffect[]) => Promise<void> | void,
  ): Promise<void> {
    if (effects.length === 0) {
      return;
    }
    try {
      if (publish) {
        await publish(effects);
        return;
      }
      for (const effect of effects) {
        await effect.publish();
      }
    } catch (error) {
      this.logger.warn(
        `${operation}: fallo al publicar efectos post-commit (${(error as Error)?.message ?? error})`,
      );
    }
  }
}
