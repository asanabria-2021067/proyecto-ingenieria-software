import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TipoNotificacion } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';

/**
 * G05-C11 · OWASP25-C038. Exactamente un valor nuevo del enum
 * TipoNotificacion (ALERTA_SEGURIDAD) en una migración aislada, aditiva y sin
 * filas. La aplicación real (desde cero y sobre la base previa) se verifica
 * contra PostgreSQL desechable (ver la auditoría de G05) y en
 * test/integration/g05-security-alert-type.integration.spec.ts.
 */

const MIGRATIONS = join(REPO_ROOT, 'apps/backend/prisma/migrations');
const NAME = '20260927230000_security_alert_notification_type';

describe('G05-C11: tipo de notificación de alerta de seguridad', () => {
  it('es la migración más reciente y contiene solo un ADD VALUE idempotente', () => {
    const dirs = readdirSync(MIGRATIONS).filter((entry) => /^\d{14}_/.test(entry)).sort();
    expect(dirs.at(-1)).toBe(NAME);
    const statements = readRepoFile(`apps/backend/prisma/migrations/${NAME}/migration.sql`)
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('--'));
    expect(statements).toEqual([`ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ALERTA_SEGURIDAD';`]);
  });

  it('no crea ni borra objetos ni filas (aditiva)', () => {
    const sql = readRepoFile(`apps/backend/prisma/migrations/${NAME}/migration.sql`).replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\b(CREATE|DROP|INSERT|UPDATE|DELETE|RENAME|TRUNCATE|ALTER\s+TABLE)\b/i);
  });

  it('schema.prisma añade el valor al final del enum sin reordenar los existentes', () => {
    const schema = readRepoFile('apps/backend/prisma/schema.prisma');
    const body = /enum TipoNotificacion \{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
    const values = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//'));
    expect(values.at(-1)).toBe('ALERTA_SEGURIDAD');
    expect(values.slice(0, -1).at(-1)).toBe('HORAS_ACREDITADAS');
    expect(values.filter((value) => value === 'ALERTA_SEGURIDAD')).toHaveLength(1);
  });

  it('el cliente Prisma generado conoce el valor', () => {
    expect(TipoNotificacion.ALERTA_SEGURIDAD).toBe('ALERTA_SEGURIDAD');
  });
});
