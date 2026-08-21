import { describe } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Base de conexión y gating reutilizable para suites de integración reales
 * contra PostgreSQL (T15-T18). Variable exclusiva: `INTEGRATION_DATABASE_URL`,
 * sin ningún fallback, para nunca apuntar por accidente a otra base. Mismo
 * patrón ya probado en `roles-participation.integration.spec.ts` (PrismaClient
 * con `datasources.db.url`, creado explícitamente por cada suite dentro de sus
 * propios hooks, nunca como singleton de módulo).
 */

export const hasIntegrationDatabase = Boolean(process.env.INTEGRATION_DATABASE_URL);

export const describeIntegration = hasIntegrationDatabase ? describe : describe.skip;

export function createIntegrationPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.INTEGRATION_DATABASE_URL,
      },
    },
  });
}
