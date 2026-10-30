import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { AdminService } from '../../src/admin/admin.service';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { getJwtSecret } from '../../src/config/jwt-secret';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SecurityEventsService } from '../../src/security-events/security-events.service';
import { WsAuthService } from '../../src/ws-auth/ws-auth.service';

process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Revocación de sesiones contra PostgreSQL real: una cuenta que deja de estar
 * ACTIVO pierde sus refresh tokens y sus access tokens ya emitidos aunque un
 * administrador la reactive después; dos refresh simultáneos con el mismo
 * token producen exactamente un par nuevo.
 */
const CONTRASENA = 'Correcta123';

describeIntegration('revocación de sesiones (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let auth: AuthService;
  let admin: AdminService;
  let strategy: JwtStrategy;
  let ws: WsAuthService;
  const ids = { admin: 0, victima: 0, rolAdmin: 0 };
  let correoVictima = '';
  let rolAdminCreado = false;

  const jwt = new JwtService({});
  const iniciarSesion = async () => {
    const tokens = await auth.login({ correo: correoVictima, contrasena: CONTRASENA });
    return tokens;
  };

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const notifications = { notifyAdminsFromTemplate: vi.fn(), notifyFromTemplate: vi.fn() } as unknown as NotificationsService;
    auth = new AuthService(prisma as unknown as PrismaService, jwt, notifications);
    admin = new AdminService(
      prisma as unknown as PrismaService,
      jwt,
      new SecurityEventsService(prisma as unknown as PrismaService),
      undefined,
      notifications,
    );
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
    ws = new WsAuthService(new JwtService({ secret: getJwtSecret() }), prisma as unknown as PrismaService);

    const hash = await bcrypt.hash(CONTRASENA, 10);
    const victima = await createIntegrationUser(prisma, { nombre: 'Victima', apellido: 'Sesion', contrasena: hash });
    const administrador = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Sesion', contrasena: hash });
    correoVictima = victima.correo;
    ids.victima = victima.idUsuario;
    ids.admin = administrador.idUsuario;
    const existente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !existente;
    const rol = existente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rol.idRolAcceso;
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: administrador.idUsuario, idRolAcceso: rol.idRolAcceso } });
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.admin, ids.victima].filter((id) => id > 0);
      await prisma.bitacoraAuditoria.deleteMany({
        where: { OR: [{ idUsuario: { in: usuarios } }, { idObjeto: { in: usuarios.map(String) } }] },
      });
      await prisma.tokenRefresco.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  it('dos refresh simultáneos con el mismo token producen exactamente un par nuevo', async () => {
    const { refreshToken } = await iniciarSesion();

    const resultados = await Promise.allSettled([auth.refreshToken(refreshToken), auth.refreshToken(refreshToken)]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazado = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(UnauthorizedException);
  });

  it('bloquear y reactivar la cuenta no resucita ni el refresh ni el access token anteriores', async () => {
    const { accessToken, refreshToken } = await iniciarSesion();
    const payload = jwt.decode(accessToken) as { sub: number; correo: string; sv: number };
    await expect(strategy.validate({ ...payload, tipo: 'access' })).resolves.toMatchObject({ userId: ids.victima });

    await admin.updateUsuarioEstado(ids.admin, ids.victima, 'BLOQUEADO' as never);
    await admin.updateUsuarioEstado(ids.admin, ids.victima, 'ACTIVO' as never);

    await expect(auth.refreshToken(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ ...payload, tipo: 'access' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(ws.authenticate({ auth: { token: accessToken }, headers: {} })).resolves.toEqual({
      ok: false,
      motivo: 'CUENTA_NO_ACTIVA',
    });

    // Una sesión nueva sí funciona.
    const nueva = await iniciarSesion();
    const payloadNuevo = jwt.decode(nueva.accessToken) as { sub: number; correo: string; sv: number };
    await expect(strategy.validate({ ...payloadNuevo, tipo: 'access' })).resolves.toMatchObject({ userId: ids.victima });
  });

  it('una pestaña vieja con un refresh revocado por el bloqueo no cierra la sesión nueva, por más veces que reintente', async () => {
    const vieja = await iniciarSesion();
    await admin.updateUsuarioEstado(ids.admin, ids.victima, 'BLOQUEADO' as never);
    await admin.updateUsuarioEstado(ids.admin, ids.victima, 'ACTIVO' as never);
    const nueva = await iniciarSesion();
    await prisma.tokenRefresco.updateMany({
      where: { idUsuario: ids.victima, revocadoEn: { not: null } },
      data: { revocadoEn: new Date(Date.now() - 60_000) },
    });

    for (let i = 0; i < 3; i += 1) {
      await expect(auth.refreshToken(vieja.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    await expect(auth.refreshToken(nueva.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('reusar un refresh ya rotado (fuera de la ventana de carrera) cierra las demás sesiones de la cuenta', async () => {
    const primera = await iniciarSesion();
    const segunda = await iniciarSesion();
    const rotada = await auth.refreshToken(primera.refreshToken);
    // Envejece la rotación para quedar fuera de la ventana de carrera entre pestañas.
    await prisma.tokenRefresco.updateMany({
      where: { idUsuario: ids.victima, revocadoEn: { not: null } },
      data: { revocadoEn: new Date(Date.now() - 60_000) },
    });

    await expect(auth.refreshToken(primera.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(auth.refreshToken(segunda.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refreshToken(rotada.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
