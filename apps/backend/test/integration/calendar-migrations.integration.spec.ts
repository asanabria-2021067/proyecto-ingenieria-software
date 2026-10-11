import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * G05-C03 (UI-15, F262-04): las dos migraciones de calendario de HU-184
 * verificadas sobre PostgreSQL real DESECHABLE (`INTEGRATION_DATABASE_URL`,
 * sin fallback: sin esa variable la suite se omite). Se inspecciona el
 * catálogo de la base ya migrada con `prisma migrate deploy`, no el
 * schema.prisma: lo que importa es lo que las migraciones dejaron de verdad.
 * No se crea, edita ni revierte ninguna migración.
 */
const MIGRACIONES = join(__dirname, '..', '..', 'prisma', 'migrations');
const M_TABLA = '20261006120000_evento_tipo_invitados_calendario_compartido';
const M_ENUM = '20261006120001_calendario_compartido_notification_type';

describeIntegration('G05-C03 — migraciones de calendario sobre base desechable', () => {
  let prisma: PrismaClient;
  const scope: IntegrationCleanupScope = { userIds: [], projectIds: [] };
  const ids = { a: 0, b: 0, proyecto: 0 };

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const a = await createIntegrationUser(prisma, { nombre: 'Mig', apellido: 'A' });
    const b = await createIntegrationUser(prisma, { nombre: 'Mig', apellido: 'B' });
    scope.userIds!.push(a.idUsuario, b.idUsuario);
    const proyecto = await createIntegrationProject(prisma, a.idUsuario, { tituloProyecto: 'Proyecto migraciones G05' });
    scope.projectIds!.push(proyecto.idProyecto);
    Object.assign(ids, { a: a.idUsuario, b: b.idUsuario, proyecto: proyecto.idProyecto });
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.calendarioCompartido.deleteMany({ where: { OR: [{ idPropietario: { in: scope.userIds } }, { idInvitado: { in: scope.userIds } }] } });
      await prisma.eventoProyecto.deleteMany({ where: { idProyecto: { in: scope.projectIds } } });
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('las dos migraciones quedaron aplicadas una vez, completas y en orden; ninguna migración de la base está fallida ni revertida', async () => {
    const filas = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null; applied_steps_count: number; started_at: Date }[]>`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count, started_at FROM _prisma_migrations ORDER BY started_at, migration_name`;
    for (const nombre of [M_TABLA, M_ENUM]) {
      const propias = filas.filter((f) => f.migration_name === nombre);
      expect(propias, nombre).toHaveLength(1);
      expect(propias[0].finished_at).not.toBeNull();
      expect(propias[0].rolled_back_at).toBeNull();
      expect(propias[0].applied_steps_count).toBe(1);
    }
    const nombres = filas.map((f) => f.migration_name);
    expect(nombres.indexOf(M_TABLA)).toBeLessThan(nombres.indexOf(M_ENUM));
    expect(filas.filter((f) => f.finished_at === null || f.rolled_back_at !== null).map((f) => f.migration_name)).toEqual([]);
  });

  it('calendario_compartido tiene exactamente sus cuatro columnas, con tipos, nulabilidad y defaults esperados', async () => {
    const columnas = await prisma.$queryRaw<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'calendario_compartido' ORDER BY ordinal_position`;
    expect(columnas.map((c) => [c.column_name, c.data_type, c.is_nullable])).toEqual([
      ['id_calendario_compartido', 'integer', 'NO'],
      ['id_propietario', 'integer', 'NO'],
      ['id_invitado', 'integer', 'NO'],
      ['creado_en', 'timestamp without time zone', 'NO'],
    ]);
    expect(columnas[0].column_default).toMatch(/^nextval\(/);
    expect(columnas[3].column_default).toBe('CURRENT_TIMESTAMP');
  });

  it('clave primaria, único (propietario, invitado), índice por invitado y dos FK a usuario con RESTRICT/CASCADE', async () => {
    const indices = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'calendario_compartido' ORDER BY indexname`;
    const def = Object.fromEntries(indices.map((i) => [i.indexname, i.indexdef]));
    expect(Object.keys(def).sort()).toEqual(['calendario_compartido_id_invitado_idx', 'calendario_compartido_id_propietario_id_invitado_key', 'calendario_compartido_pkey']);
    expect(def.calendario_compartido_pkey).toMatch(/UNIQUE INDEX .*\(id_calendario_compartido\)/);
    expect(def.calendario_compartido_id_propietario_id_invitado_key).toMatch(/UNIQUE INDEX .*\(id_propietario, id_invitado\)/);
    expect(def.calendario_compartido_id_invitado_idx).toMatch(/^CREATE INDEX .*\(id_invitado\)/);

    const fks = await prisma.$queryRaw<{ conname: string; columna: string; tabla: string; ref: string; confdeltype: string; confupdtype: string }[]>`
      SELECT c.conname, a.attname AS columna, t.relname AS tabla, af.attname AS ref, c.confdeltype::text, c.confupdtype::text
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND r.relname = 'calendario_compartido' AND n.nspname = current_schema() ORDER BY c.conname`;
    expect(fks).toEqual([
      { conname: 'calendario_compartido_id_invitado_fkey', columna: 'id_invitado', tabla: 'usuario', ref: 'id_usuario', confdeltype: 'r', confupdtype: 'c' },
      { conname: 'calendario_compartido_id_propietario_fkey', columna: 'id_propietario', tabla: 'usuario', ref: 'id_usuario', confdeltype: 'r', confupdtype: 'c' },
    ]);
  });

  it('evento_proyecto ganó tipo_evento (OTRO por defecto) e invitados (lista vacía por defecto), ambas NOT NULL', async () => {
    const columnas = await prisma.$queryRaw<{ column_name: string; udt_name: string; is_nullable: string; column_default: string | null }[]>`
      SELECT column_name, udt_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'evento_proyecto' AND column_name IN ('tipo_evento', 'invitados') ORDER BY column_name`;
    expect(columnas).toEqual([
      { column_name: 'invitados', udt_name: '_int4', is_nullable: 'NO', column_default: 'ARRAY[]::integer[]' },
      { column_name: 'tipo_evento', udt_name: 'TipoEvento', is_nullable: 'NO', column_default: `'OTRO'::"TipoEvento"` },
    ]);
  });

  it('los enums existen con sus valores: TipoEvento completo y TipoNotificacion con CALENDARIO_COMPARTIDO sin perder ninguno previo', async () => {
    const etiquetas = async (nombre: string) =>
      (await prisma.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = ${nombre} AND n.nspname = current_schema()`).map((f) => f.enumlabel);
    // Se comparan como conjuntos: el orden físico de un enum de PostgreSQL no es parte del contrato.
    expect((await etiquetas('TipoEvento')).sort()).toEqual(['ENTREGA', 'OTRO', 'REUNION', 'REVISION', 'TALLER', 'TUTORIA']);

    const enBase = await etiquetas('TipoNotificacion');
    expect(enBase).toContain('CALENDARIO_COMPARTIDO');
    expect(new Set(enBase).size).toBe(enBase.length);
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    const cuerpo = (schema.match(/enum TipoNotificacion \{([\s\S]*?)\n\}/) as RegExpMatchArray)[1];
    const enSchema = cuerpo.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter((l) => /^[A-Z0-9_]+$/.test(l));
    expect(enSchema.length).toBeGreaterThan(5);
    expect([...enBase].sort()).toEqual([...enSchema].sort());
  });

  it('una fila creada sin las columnas nuevas (como las que ya existían) toma OTRO y sin invitados; no hay eventos sin tipo', async () => {
    const [{ id_evento: idEvento }] = await prisma.$queryRaw<{ id_evento: number }[]>`
      INSERT INTO evento_proyecto (id_proyecto, id_creador, titulo_evento, fecha_inicio, fecha_fin)
      VALUES (${ids.proyecto}, ${ids.a}, 'Evento anterior a HU-184', '2030-01-10T15:00:00Z', '2030-01-10T16:00:00Z') RETURNING id_evento`;
    const fila = await prisma.eventoProyecto.findUniqueOrThrow({ where: { idEvento }, select: { tipoEvento: true, invitados: true, tituloEvento: true } });
    expect(fila).toEqual({ tipoEvento: 'OTRO', invitados: [], tituloEvento: 'Evento anterior a HU-184' });
    const [{ sinTipo }] = await prisma.$queryRaw<{ sinTipo: bigint }[]>`SELECT count(*) AS "sinTipo" FROM evento_proyecto WHERE tipo_evento IS NULL OR invitados IS NULL`;
    expect(Number(sinTipo)).toBe(0);
  });

  it('la base hace cumplir el único y las FK: sin duplicados, sin usuarios inexistentes y sin borrar un usuario con comparticiones', async () => {
    await prisma.calendarioCompartido.create({ data: { idPropietario: ids.a, idInvitado: ids.b } });
    await expect(prisma.calendarioCompartido.create({ data: { idPropietario: ids.a, idInvitado: ids.b } })).rejects.toMatchObject({ code: 'P2002' });
    // El par inverso es otra relación distinta y sí cabe.
    await expect(prisma.calendarioCompartido.create({ data: { idPropietario: ids.b, idInvitado: ids.a } })).resolves.toMatchObject({ idPropietario: ids.b });
    await expect(prisma.calendarioCompartido.create({ data: { idPropietario: ids.a, idInvitado: 2_000_000_000 } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.$executeRaw`DELETE FROM usuario WHERE id_usuario = ${ids.b}`).rejects.toThrow();
    expect(await prisma.usuario.count({ where: { idUsuario: ids.b } })).toBe(1);
    expect(await prisma.calendarioCompartido.count({ where: { OR: [{ idPropietario: ids.a }, { idPropietario: ids.b }] } })).toBe(2);
  });

  it('las dos migraciones son aditivas: no borran, renombran ni reescriben nada existente', () => {
    const sql = (nombre: string) => readFileSync(join(MIGRACIONES, nombre, 'migration.sql'), 'utf8').replace(/^--.*$/gm, '');
    for (const nombre of [M_TABLA, M_ENUM]) {
      expect(sql(nombre), nombre).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|RENAME|ALTER\s+COLUMN|SET\s+NOT\s+NULL)\b/i);
    }
    // Columnas nuevas en una tabla con filas: NOT NULL solo porque llevan DEFAULT.
    const altas = sql(M_TABLA).match(/ADD COLUMN[^;]+;/g) as RegExpMatchArray;
    expect(altas).toHaveLength(2);
    for (const alta of altas) expect(alta).toMatch(/NOT NULL DEFAULT/);
    // Valor de enum añadido de forma repetible y sin tocar los existentes.
    expect(sql(M_ENUM).trim()).toBe(`ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CALENDARIO_COMPARTIDO';`);
  });
});
