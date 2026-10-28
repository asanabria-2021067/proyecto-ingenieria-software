import { afterAll, beforeAll, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { cleanupAdminMeetings } from './setup/admin-meetings';

/**
 * HU-195 (G02): las cuatro migraciones de reuniones de Administración sobre
 * PostgreSQL real DESECHABLE. Se prueba lo que las migraciones dejaron en la
 * base (FK, UNIQUE, RESTRICT, defaults, enum), no el schema.prisma.
 */
const MIGRACIONES = [
  '20261025100000_add_reunion_administracion',
  '20261025100100_add_reunion_administrador_editor',
  '20261025100200_add_reunion_notification_types',
  '20261025100300_add_notificacion_clave_idempotencia',
];

const esCodigo = (codigo: string) => (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === codigo;

describeIntegration('HU-195 G02 — migraciones de reuniones de Administración', () => {
  let prisma: PrismaClient;
  const scope: IntegrationCleanupScope = { userIds: [], projectIds: [] };
  const ids = { admin: 0, otro: 0, p1: 0, p2: 0 };
  const evento = (idProyecto: number, idReunion: number | null) => ({
    idProyecto,
    idCreador: ids.admin,
    tituloEvento: 'Reunión G02',
    fechaInicio: new Date('2031-05-01T15:00:00Z'),
    fechaFin: new Date('2031-05-01T16:00:00Z'),
    tipoEvento: 'REUNION' as const,
    idReunion,
  });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'G02' });
    const otro = await createIntegrationUser(prisma, { nombre: 'Otro', apellido: 'G02' });
    scope.userIds!.push(admin.idUsuario, otro.idUsuario);
    const p1 = await createIntegrationProject(prisma, otro.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    const p2 = await createIntegrationProject(prisma, otro.idUsuario, { estadoProyecto: 'PUBLICADO' });
    scope.projectIds!.push(p1.idProyecto, p2.idProyecto);
    Object.assign(ids, { admin: admin.idUsuario, otro: otro.idUsuario, p1: p1.idProyecto, p2: p2.idProyecto });
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('las cuatro migraciones quedaron aplicadas una vez, completas y en orden', async () => {
    const filas = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at, migration_name`;
    const nombres = filas.map((f) => f.migration_name);
    for (const nombre of MIGRACIONES) {
      const propias = filas.filter((f) => f.migration_name === nombre);
      expect(propias, nombre).toHaveLength(1);
      expect(propias[0].finished_at).not.toBeNull();
      expect(propias[0].rolled_back_at).toBeNull();
    }
    expect(MIGRACIONES.map((n) => nombres.indexOf(n))).toEqual([...MIGRACIONES.map((n) => nombres.indexOf(n))].sort((a, b) => a - b));
  });

  it('el enum de notificaciones contiene los tres tipos de reunión al final, sin reordenar los existentes', async () => {
    const valores = await prisma.$queryRaw<{ v: string }[]>`
      SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TipoNotificacion' ORDER BY e.enumsortorder`;
    const lista = valores.map((f) => f.v);
    expect(lista.slice(-3)).toEqual(['REUNION_PROGRAMADA', 'REUNION_ACTUALIZADA', 'REUNION_CANCELADA']);
    expect(lista.indexOf('MENCION_COMENTARIO')).toBe(lista.length - 4);
  });

  it('una reunión nace con política TODOS_ADMINISTRADORES y versión 1', async () => {
    const reunion = await prisma.reunionAdministracion.create({ data: { idCreador: ids.admin } });
    expect(reunion).toMatchObject({ politicaEdicion: 'TODOS_ADMINISTRADORES', version: 1, canceladaEn: null });
  });

  it('UNIQUE(id_reunion, id_proyecto): una sola proyección por proyecto; los eventos ordinarios (NULL) no se ven afectados', async () => {
    const reunion = await prisma.reunionAdministracion.create({ data: { idCreador: ids.admin } });
    await prisma.eventoProyecto.create({ data: evento(ids.p1, reunion.idReunion) });
    await prisma.eventoProyecto.create({ data: evento(ids.p2, reunion.idReunion) });
    await expect(prisma.eventoProyecto.create({ data: evento(ids.p1, reunion.idReunion) })).rejects.toSatisfy(esCodigo('P2002'));
    // Dos eventos ordinarios del mismo proyecto siguen permitidos.
    await prisma.eventoProyecto.create({ data: evento(ids.p1, null) });
    await prisma.eventoProyecto.create({ data: evento(ids.p1, null) });
  });

  it('FK: una proyección no puede apuntar a una reunión inexistente', async () => {
    await expect(prisma.eventoProyecto.create({ data: evento(ids.p1, 2_000_000_000) })).rejects.toSatisfy(esCodigo('P2003'));
  });

  it('RESTRICT: no se borra físicamente una reunión con proyecciones ni con editores', async () => {
    const reunion = await prisma.reunionAdministracion.create({ data: { idCreador: ids.admin } });
    await prisma.eventoProyecto.create({ data: evento(ids.p2, reunion.idReunion) });
    await expect(prisma.reunionAdministracion.delete({ where: { idReunion: reunion.idReunion } })).rejects.toSatisfy(esCodigo('P2003'));

    const conEditor = await prisma.reunionAdministracion.create({
      data: { idCreador: ids.admin, politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: { create: { idUsuario: ids.otro } } },
    });
    await expect(prisma.reunionAdministracion.delete({ where: { idReunion: conEditor.idReunion } })).rejects.toSatisfy(esCodigo('P2003'));
  });

  it('PK compuesta de editores: el mismo administrador no se repite en una reunión', async () => {
    const reunion = await prisma.reunionAdministracion.create({ data: { idCreador: ids.admin } });
    await prisma.reunionAdministradorEditor.create({ data: { idReunion: reunion.idReunion, idUsuario: ids.otro } });
    await expect(prisma.reunionAdministradorEditor.create({ data: { idReunion: reunion.idReunion, idUsuario: ids.otro } })).rejects.toSatisfy(esCodigo('P2002'));
  });

  it('UNIQUE(id_usuario, clave_idempotencia): la misma clave no se repite por usuario; NULL y otros usuarios sí', async () => {
    const base = { tipoNotificacion: 'REUNION_PROGRAMADA' as const, tituloNotificacion: 'G02' };
    await prisma.notificacion.create({ data: { ...base, idUsuario: ids.admin, claveIdempotencia: 'reunion:g02:v1:programada' } });
    await expect(
      prisma.notificacion.create({ data: { ...base, idUsuario: ids.admin, claveIdempotencia: 'reunion:g02:v1:programada' } }),
    ).rejects.toSatisfy(esCodigo('P2002'));
    await prisma.notificacion.create({ data: { ...base, idUsuario: ids.otro, claveIdempotencia: 'reunion:g02:v1:programada' } });
    await prisma.notificacion.createMany({ data: [{ ...base, idUsuario: ids.admin }, { ...base, idUsuario: ids.admin }] });
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.admin, claveIdempotencia: null } })).toBe(2);
  });
});
