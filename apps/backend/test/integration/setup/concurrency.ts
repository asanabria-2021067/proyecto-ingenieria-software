import { afterAll, beforeAll } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Harness de concurrencia para las suites de integración del Sprint 7
 * (06 v2 §47 y §42): dos conexiones PostgreSQL reales, barreras explícitas
 * que fijan el entrelazado después de los reads internos de la primera
 * operación, y un presupuesto de tiempo en lugar de sleeps arbitrarios.
 * Reutiliza el gating por `INTEGRATION_DATABASE_URL` de `database.ts`, no
 * abre transacciones propias y no mantiene estado de módulo: solo entrega
 * clientes, barreras y utilidades a la suite que los consume.
 */

const INTEGRATION_DATABASE_URL_VARIABLE = 'INTEGRATION_DATABASE_URL';

function resolveIntegrationDatabaseUrl(): string {
  const url = process.env[INTEGRATION_DATABASE_URL_VARIABLE];
  if (!url) {
    throw new Error(
      `${INTEGRATION_DATABASE_URL_VARIABLE} no está definida: el harness de concurrencia ` +
        'solo se ejecuta contra la base de integración desechable.',
    );
  }
  return url;
}

/**
 * Abre un `PrismaClient` independiente (segunda conexión física) contra la
 * misma base de integración que `createIntegrationPrismaClient`. El caller es
 * dueño del ciclo de vida y debe llamar a `$disconnect()` en su teardown;
 * `useSecondClient` lo hace automáticamente con hooks de vitest.
 */
export function createSecondClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: resolveIntegrationDatabaseUrl() } },
  });
}

/**
 * Variante con ciclo de vida gestionado: crea la segunda conexión en
 * `beforeAll` y la cierra en `afterAll` de la suite que la invoca. Devuelve
 * un accessor porque el cliente no existe hasta que corren los hooks, y no se
 * crea nunca cuando la suite está saltada por falta de base.
 */
export function useSecondClient(): () => PrismaClient {
  let client: PrismaClient | undefined;

  beforeAll(() => {
    client = createSecondClient();
  });

  afterAll(async () => {
    const current = client;
    client = undefined;
    await current?.$disconnect();
  });

  return () => {
    if (!client) {
      throw new Error(
        'La segunda conexión solo está disponible dentro de los tests de la suite que llamó a useSecondClient().',
      );
    }
    return client;
  };
}

/**
 * Barrera de `size` participantes basada en promesas. `arrive()` registra la
 * llegada de un participante y devuelve la promesa que se libera cuando todos
 * han llegado; `wait()` observa la liberación sin contar como llegada. Llegar
 * más veces que `size` es un error de la prueba, no una espera silenciosa.
 */
export interface Barrier {
  readonly size: number;
  readonly arrived: number;
  arrive(): Promise<void>;
  wait(): Promise<void>;
}

export function createBarrier(size: number): Barrier {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`createBarrier requiere un entero >= 1; se recibió ${String(size)}.`);
  }

  let arrived = 0;
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    size,
    get arrived() {
      return arrived;
    },
    arrive() {
      if (arrived >= size) {
        throw new Error(`La barrera de ${size} participantes recibió más llegadas de las esperadas.`);
      }
      arrived += 1;
      if (arrived === size) {
        release();
      }
      return released;
    },
    wait() {
      return released;
    },
  };
}

/**
 * Presupuesto de tiempo explícito: rechaza con un error descriptivo si la
 * operación no se resuelve dentro de `ms`. Sustituye a los sleeps
 * arbitrarios: la prueba falla rápido cuando un entrelazado queda bloqueado,
 * en vez de esperar al timeout global de vitest.
 */
export async function withDeadline<T>(
  operation: Promise<T>,
  ms: number,
  label = 'operación',
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`withDeadline requiere un presupuesto positivo en ms; se recibió ${String(ms)}.`);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Deadline de ${ms} ms excedido: ${label}.`));
    }, ms);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function describeOutcome(outcome: unknown): string {
  try {
    return JSON.stringify(outcome) ?? String(outcome);
  } catch {
    return String(outcome);
  }
}

/**
 * Normaliza el 409 esperado en los contratos de carrera: ejecuta `fn`, exige
 * que rechace con una `HttpException` de estado 409 y devuelve la excepción
 * para aserciones adicionales (código, mensaje). Un éxito o cualquier otro
 * error hacen fallar la prueba mostrando lo observado.
 */
export async function expectConflict(fn: () => Promise<unknown>): Promise<HttpException> {
  let outcome: unknown;
  try {
    outcome = await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === 409) {
      return error;
    }
    const detail = error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error);
    throw new Error(`Se esperaba un 409 Conflict pero la operación falló con: ${detail}`);
  }
  throw new Error(
    `Se esperaba un 409 Conflict pero la operación se resolvió con: ${describeOutcome(outcome)}`,
  );
}
