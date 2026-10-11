import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';

/**
 * G05-C11 · OWASP25-C038. Contra PostgreSQL real (migrado con
 * `prisma migrate deploy`): el enum incluye ALERTA_SEGURIDAD y la migración no
 * creó ninguna notificación de ese tipo.
 */
describeIntegration('G05-C11 — enum TipoNotificacion en PostgreSQL real', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ALERTA_SEGURIDAD existe en el enum y la migración no creó filas', async () => {
    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'TipoNotificacion' ORDER BY e.enumsortorder`;
    const values = labels.map((row) => row.enumlabel);
    // Valores agregados después por otras migraciones (p. ej. CALENDARIO_COMPARTIDO
    // de HU-184) pueden quedar al final: lo que importa es que ALERTA_SEGURIDAD
    // exista una sola vez y llegue después de HORAS_ACREDITADAS, sin reordenar.
    expect(values.filter((value) => value === 'ALERTA_SEGURIDAD')).toHaveLength(1);
    expect(values.indexOf('ALERTA_SEGURIDAD')).toBeGreaterThan(values.indexOf('HORAS_ACREDITADAS'));
    expect(values.indexOf('HORAS_ACREDITADAS')).toBeGreaterThan(-1);
    const migration = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE migration_name = '20260927230000_security_alert_notification_type' AND finished_at IS NOT NULL`;
    expect(migration).toHaveLength(1);
    expect(await prisma.notificacion.count({ where: { tipoNotificacion: 'ALERTA_SEGURIDAD' } })).toBe(0);
  });
});
