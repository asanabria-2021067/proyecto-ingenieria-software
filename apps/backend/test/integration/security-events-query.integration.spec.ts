import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';

/**
 * FG01 (T-310): visor administrativo de eventos de seguridad contra
 * PostgreSQL real, con las migraciones del repositorio aplicadas.
 */
describeIntegration('FG01-C06 — índice de la línea de tiempo de seguridad (PostgreSQL real)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('la migración crea el índice con el filtro fijo y el orden de la paginación', async () => {
    const indices = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx'`;
    expect(indices).toHaveLength(1);
    expect(indices[0].indexdef).toMatch(/USING btree \(tipo_objeto, fecha_evento DESC, id_auditoria DESC\)$/);
  });

  it('el índice funcional de la bitácora de proyectos sigue existiendo', async () => {
    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'bitacora_auditoria'
      ORDER BY indexname`;
    expect(indices.map((indice) => indice.indexname)).toEqual([
      'bitacora_auditoria_id_proyecto_fecha_idx',
      'bitacora_auditoria_pkey',
      'bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx',
    ]);
  });

  it('la migración es aditiva y reintentable: solo un CREATE INDEX IF NOT EXISTS', async () => {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20261011120000_security_audit_timeline/migration.sql'),
      'utf8',
    );
    const sentencias = sql
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((sentencia) => sentencia.trim())
      .filter(Boolean);
    expect(sentencias).toHaveLength(1);
    expect(sentencias[0]).toMatch(/^CREATE INDEX IF NOT EXISTS "bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx"/);
    await expect(prisma.$executeRawUnsafe(sentencias[0])).resolves.toBeDefined();
  });
});
