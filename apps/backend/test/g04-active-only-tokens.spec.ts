import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';

/**
 * G04-C03 · OWASP25-C023 (conserva C002). Solo una cuenta ACTIVO recibe
 * credenciales nuevas, tanto en login como en refresh; BLOQUEADO e INACTIVO
 * no reciben tokens aunque la contraseña o el refresh sean válidos. La última
 * sesión se registra únicamente tras un login exitoso.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const PASSWORD = 'Correcta123';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const ESTADOS_SIN_ACCESO = ['BLOQUEADO', 'INACTIVO'] as const;

function makeService(estado: string, registro: Record<string, unknown> | null = null) {
  const usuario = { idUsuario: 5, correo: 'a@uvg.edu.gt', contrasena: HASH, estado };
  const prisma = {
    usuario: {
      findUnique: vi.fn().mockResolvedValue(usuario),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(registro),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const jwtService = {
    sign: vi.fn().mockReturnValue('jwt-nuevo'),
    verify: vi.fn().mockReturnValue({ sub: 5, correo: 'a@uvg.edu.gt', tipo: 'refresh' }),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
    { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
  );
  return { service, prisma, jwtService };
}

const registroVigente = { idTokenRefresco: 'r1', revocadoEn: null, expiraEn: new Date(Date.now() + 60_000) };

describe('G04-C03: tokens solo para usuarios ACTIVO', () => {
  it('login ACTIVO: emite tokens y registra fechaUltimaSesion', async () => {
    const { service, prisma } = makeService('ACTIVO');
    const antes = Date.now();

    await expect(service.login({ correo: 'a@uvg.edu.gt', contrasena: PASSWORD })).resolves.toEqual({
      accessToken: 'jwt-nuevo',
      refreshToken: 'jwt-nuevo',
    });

    expect(prisma.tokenRefresco.create).toHaveBeenCalledTimes(1);
    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { idUsuario: 5 },
      data: { fechaUltimaSesion: expect.any(Date) },
    });
    const fecha = prisma.usuario.update.mock.calls[0][0].data.fechaUltimaSesion as Date;
    expect(fecha.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it.each(ESTADOS_SIN_ACCESO)('login %s con contraseña correcta: sin tokens, sin última sesión, respuesta genérica', async (estado) => {
    const { service, prisma } = makeService(estado);

    await expect(service.login({ correo: 'a@uvg.edu.gt', contrasena: PASSWORD })).rejects.toThrow(
      new UnauthorizedException('Credenciales invalidas'),
    );
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('contraseña incorrecta no actualiza la última sesión', async () => {
    const { service, prisma } = makeService('ACTIVO');
    await expect(service.login({ correo: 'a@uvg.edu.gt', contrasena: 'Otra12345' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('refresh ACTIVO: rota y emite un par nuevo', async () => {
    const { service, prisma } = makeService('ACTIVO', registroVigente);
    await expect(service.refreshToken('refresh-viejo')).resolves.toEqual({
      accessToken: 'jwt-nuevo',
      refreshToken: 'jwt-nuevo',
    });
    expect(prisma.tokenRefresco.create).toHaveBeenCalledTimes(1);
  });

  it.each(ESTADOS_SIN_ACCESO)('refresh %s: revoca el token presentado y no emite credenciales', async (estado) => {
    const { service, prisma } = makeService(estado, registroVigente);

    await expect(service.refreshToken('refresh-viejo')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.tokenRefresco.update).toHaveBeenCalledWith({
      where: { idTokenRefresco: 'r1' },
      data: { revocadoEn: expect.any(Date) },
    });
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });

  it('refresh de un usuario que ya no existe: sin credenciales', async () => {
    const { service, prisma } = makeService('ACTIVO', registroVigente);
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(service.refreshToken('refresh-viejo')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });
});
