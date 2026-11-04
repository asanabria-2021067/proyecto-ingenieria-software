import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { cleanupLeadershipFixture, createIntegrationAdmin, type LeadershipCleanupScope } from './setup/leadership';
import { AdminTablasService } from '../../src/admin/admin-tablas.service';
import { MaintenanceService } from '../../src/maintenance/maintenance.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * ADM-1 contra PostgreSQL real: vista de tablas (lista blanca, correo
 * enmascarado, bitácora, 403) y modo mantenimiento con Redis caído (respaldo
 * en la base) y registro en bitácora.
 */
describeIntegration('ADM-1 — tablas del administrador y mantenimiento (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let tablas: AdminTablasService;
  let mantenimiento: MaintenanceService;
  const scope: LeadershipCleanupScope = {};
  let admin: Awaited<ReturnType<typeof createIntegrationAdmin>>;
  let estudiante: Awaited<ReturnType<typeof createIntegrationUser>>;
  let coordinador: Awaited<ReturnType<typeof createIntegrationUser>>;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    admin = await createIntegrationAdmin(prisma, scope);
    estudiante = await createIntegrationUser(prisma, { nombre: '=2+2', correo: `adm1-${Date.now()}@example.test` });
    coordinador = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), estudiante.idUsuario, coordinador.idUsuario];
    const rol = await prisma.rolAcceso.upsert({
      where: { nombrePerfil: 'coordinador_academico' },
      update: {},
      create: { nombrePerfil: 'coordinador_academico' },
    });
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: coordinador.idUsuario, idRolAcceso: rol.idRolAcceso } });
    scope.accessRoleUserIds = [...(scope.accessRoleUserIds ?? []), coordinador.idUsuario];
    tablas = new AdminTablasService(prisma as unknown as PrismaService);
    const redisCaido = {
      get: () => Promise.reject(new Error('redis caido')),
      set: () => Promise.reject(new Error('redis caido')),
    };
    mantenimiento = new MaintenanceService(prisma as unknown as PrismaService, redisCaido as never);
  });

  afterAll(async () => {
    await prisma.configuracionSistema.deleteMany({ where: { clave: 'mantenimiento' } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: admin.idUsuario } });
    await cleanupLeadershipFixture(prisma, scope);
    await prisma.$disconnect();
  });

  it('la lista enmascara el correo, no trae contraseña y queda en bitácora', async () => {
    const res = await tablas.consultar(admin.idUsuario, 'usuarios', { q: estudiante.correo.slice(0, 20) });
    const fila = res.filas.find((f) => f.idUsuario === estudiante.idUsuario);
    expect(fila?.correo).toMatch(/^a\*\*\*@example\.test$/);
    expect(JSON.stringify(res)).not.toContain(estudiante.correo);
    expect(JSON.stringify(res)).not.toContain('integration-test-hash');
    expect(fila).not.toHaveProperty('contrasena');
    const registro = await prisma.bitacoraAuditoria.findFirst({
      where: { idUsuario: admin.idUsuario, accion: 'ADMIN_TABLA_CONSULTA', tipoObjeto: 'Tabla:usuarios' },
    });
    expect(registro).not.toBeNull();
  });

  it('el detalle trae el correo completo y la exportación neutraliza fórmulas sin campos prohibidos', async () => {
    const detalle = await tablas.detalle(admin.idUsuario, 'usuarios', estudiante.idUsuario);
    expect(detalle.correo).toBe(estudiante.correo);
    expect(detalle).not.toHaveProperty('contrasena');
    const csv = await tablas.exportar(admin.idUsuario, 'usuarios', { q: estudiante.correo.slice(0, 20) });
    expect(csv).toContain("'=2+2");
    expect(csv).not.toContain('integration-test-hash');
    expect(csv).not.toContain(estudiante.correo);
    const acciones = await prisma.bitacoraAuditoria.findMany({
      where: { idUsuario: admin.idUsuario, accion: { in: ['ADMIN_TABLA_DETALLE', 'ADMIN_TABLA_EXPORTACION'] } },
    });
    expect(acciones.map((a) => a.accion).sort()).toEqual(['ADMIN_TABLA_DETALLE', 'ADMIN_TABLA_EXPORTACION']);
  });

  it('estudiante y coordinador reciben 403 en todas las operaciones', async () => {
    for (const actor of [estudiante, coordinador]) {
      await expect(tablas.consultar(actor.idUsuario, 'usuarios', {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(tablas.detalle(actor.idUsuario, 'usuarios', 1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(tablas.exportar(actor.idUsuario, 'usuarios', {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(mantenimiento.actualizar(actor.idUsuario, { activo: true })).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('con Redis caído el mantenimiento se guarda y se lee de la base, y queda en bitácora', async () => {
    await mantenimiento.actualizar(admin.idUsuario, { activo: true, mensaje: 'Migración de base' });
    expect(await mantenimiento.estado()).toMatchObject({ bloqueando: true, mensaje: 'Migración de base' });
    await mantenimiento.actualizar(admin.idUsuario, { activo: false, inicioProgramado: new Date(Date.now() - 60_000).toISOString() });
    // Apagar con un inicio ya vencido lo descarta: la plataforma deja de bloquear.
    expect(await mantenimiento.estado()).toMatchObject({ bloqueando: false, inicioProgramado: null });
    await mantenimiento.actualizar(admin.idUsuario, { activo: false, inicioProgramado: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await mantenimiento.estado()).bloqueando).toBe(false);
    const acciones = await prisma.bitacoraAuditoria.findMany({
      where: { idUsuario: admin.idUsuario, tipoObjeto: 'Mantenimiento' },
      orderBy: { idAuditoria: 'asc' },
    });
    expect(acciones.map((a) => a.accion)).toEqual([
      'MANTENIMIENTO_ACTIVADO',
      'MANTENIMIENTO_DESACTIVADO',
      'MANTENIMIENTO_PROGRAMADO',
    ]);
  });
});
