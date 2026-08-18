import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { AuthService } from '../src/auth/auth.service';
import { AdminService } from '../src/admin/admin.service';
import { NotificationsService } from '../src/notifications/notifications.service';

// Same 4 scenarios as password-recovery-admin.e2e.spec.ts, but against a real
// Postgres instead of the in-memory fake -- exercises the actual migration
// (token_utilizado_en column, FKs) and real Prisma queries. Only runs when
// pointed at a disposable local DB via RUN_REAL_DB_TESTS=1 (see README note
// below); skipped otherwise so it never breaks CI or other machines.
//
// To run locally:
//   docker compose up -d postgres   (from repo root)
//   DATABASE_URL=postgresql://<user>:<pass>@localhost:<port>/<db> npx prisma migrate deploy
//   RUN_REAL_DB_TESTS=1 DATABASE_URL=<same url> npx vitest run test/password-recovery-admin.real-db.e2e.spec.ts
describe.skipIf(!process.env.RUN_REAL_DB_TESTS)('HU-14 contra Postgres real (local, disposable)', () => {
  const prisma = new PrismaClient();
  const jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });

  let adminId: number;
  let studentId: number;
  const ADMIN_CORREO = 'admin-realdb-test@uvg.edu.gt';
  const CARNE = '99999999';
  const CORREO_INSTITUCIONAL = 'estudiante-realdb-test@uvg.edu.gt';

  let authService: AuthService;
  let adminService: AdminService;

  beforeAll(async () => {
    await prisma.rolAcceso.upsert({
      where: { nombrePerfil: 'administrador' },
      update: {},
      create: { nombrePerfil: 'administrador' },
    });
  });

  beforeEach(async () => {
    const admin = await prisma.usuario.create({
      data: { correo: ADMIN_CORREO, contrasena: 'hash', nombre: 'Admin', apellido: 'Test' },
    });
    adminId = admin.idUsuario;
    const rol = await prisma.rolAcceso.findUniqueOrThrow({ where: { nombrePerfil: 'administrador' } });
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: adminId, idRolAcceso: rol.idRolAcceso } });

    const student = await prisma.usuario.create({
      data: { correo: CORREO_INSTITUCIONAL, contrasena: 'old-hash', nombre: 'Est', apellido: 'Udiante' },
    });
    studentId = student.idUsuario;
    await prisma.perfilEstudiante.create({ data: { idUsuario: studentId, carne: CARNE } });

    const notificationsService = new NotificationsService(
      prisma as unknown as PrismaService,
      {} as unknown as NotificationsGateway,
    );
    authService = new AuthService(prisma as unknown as PrismaService, jwtService, notificationsService);
    adminService = new AdminService(prisma as unknown as PrismaService, jwtService);
  });

  afterEach(async () => {
    // full cleanup after every test so unique constraints (correo) don't collide
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: [adminId, studentId] } } });
    await prisma.solicitudRecuperacion.deleteMany({ where: { idUsuario: studentId } });
    await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: studentId } });
    await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: adminId } });
    await prisma.usuario.deleteMany({ where: { idUsuario: { in: [adminId, studentId] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('flujo completo contra Postgres real', async () => {
    await authService.forgotPassword(CARNE, CORREO_INSTITUCIONAL);

    const notifs = await prisma.notificacion.findMany({ where: { idUsuario: adminId } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].tipoNotificacion).toBe('SOLICITUD_RECUPERACION_CONTRASENA');

    const pendientes = await adminService.getSolicitudesRecuperacionPendientes(adminId);
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].carneReferencia).toBe(CARNE);

    const { resetToken } = await adminService.generarEnlaceRecuperacion(adminId, pendientes[0].idSolicitud);

    const pendientesDespues = await adminService.getSolicitudesRecuperacionPendientes(adminId);
    expect(pendientesDespues).toHaveLength(0);

    await authService.resetPassword(resetToken, 'NuevaClave123');

    const usuarioActualizado = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: studentId } });
    expect(await bcrypt.compare('NuevaClave123', usuarioActualizado.contrasena)).toBe(true);
  });

  it('rechaza un token ya utilizado (no reutilizable) contra Postgres real', async () => {
    await authService.forgotPassword(CARNE, CORREO_INSTITUCIONAL);
    const pendientes = await adminService.getSolicitudesRecuperacionPendientes(adminId);
    const { resetToken } = await adminService.generarEnlaceRecuperacion(adminId, pendientes[0].idSolicitud);

    await authService.resetPassword(resetToken, 'PrimeraClave123');

    await expect(authService.resetPassword(resetToken, 'SegundaClave456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('niega acceso a un usuario sin rol admin contra Postgres real', async () => {
    await expect(adminService.getSolicitudesRecuperacionPendientes(studentId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
