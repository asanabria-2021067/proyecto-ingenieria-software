import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';
import * as bcrypt from 'bcryptjs';

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

// AuthService exige esta variable al construirse (ver auth.service.ts) - sin
// ella, ninguno de los tests de este archivo podría instanciar el servicio.
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

describe('AuthService', () => {
  it('login retorna token cuando credenciales son validas', async () => {
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1, correo: 'a@uvg.edu', contrasena: 'hash' }) },
      tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    };
    const jwtService = { sign: vi.fn().mockReturnValue('jwt-token') };
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const notificationsService = { notifyAdminsFromTemplate: vi.fn() };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      notificationsService as unknown as NotificationsService,
    );

    const result = await service.login({ correo: 'a@uvg.edu', contrasena: '123456' });

    expect(result).toEqual({ accessToken: 'jwt-token', refreshToken: 'jwt-token' });
  });

  it('login falla si usuario no existe', async () => {
    const service = new AuthService(
      { usuario: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaService,
      { sign: vi.fn() } as unknown as JwtService,
      { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
    );

    await expect(service.login({ correo: 'x@x.com', contrasena: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('register crea usuario y perfil y retorna token', async () => {
    const tx = {
      usuario: { create: vi.fn().mockResolvedValue({ idUsuario: 7, correo: 'n@uvg.edu' }) },
      perfilEstudiante: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)),
      tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    };
    const jwtService = { sign: vi.fn().mockReturnValue('token-register') };
    (bcrypt.hash as Mock).mockResolvedValue('hashed');
    const notificationsService = { notifyAdminsFromTemplate: vi.fn() };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      notificationsService as unknown as NotificationsService,
    );

    const result = await service.register({
      correo: 'n@uvg.edu',
      contrasena: '123',
      nombre: 'Nuevo',
      apellido: 'User',
      carne: '1',
      idCarrera: 2,
      semestre: 4,
    });

    expect(result).toEqual({ accessToken: 'token-register', refreshToken: 'token-register' });
    expect(tx.usuario.create).toHaveBeenCalled();
    expect(tx.perfilEstudiante.create).toHaveBeenCalled();
  });

  it('register falla si correo ya existe', async () => {
    const service = new AuthService(
      { usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1 }) } } as unknown as PrismaService,
      { sign: vi.fn() } as unknown as JwtService,
      { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
    );

    await expect(
      service.register({
        correo: 'dup@uvg.edu',
        contrasena: '123',
        nombre: 'Dup',
        apellido: 'User',
        carne: '1',
        idCarrera: 1,
        semestre: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('refreshToken', () => {
    function makeService(opts: {
      verifyReturn?: Record<string, unknown>;
      verifyThrows?: boolean;
      registro?: Record<string, unknown> | null;
    }) {
      const jwtService = {
        verify: opts.verifyThrows
          ? vi.fn().mockImplementation(() => {
              throw new Error('expirado o invalido');
            })
          : vi.fn().mockReturnValue(opts.verifyReturn),
        sign: vi.fn().mockReturnValue('token-nuevo'),
      };
      const prisma = {
        tokenRefresco: {
          findUnique: vi.fn().mockResolvedValue(opts.registro ?? null),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      const service = new AuthService(
        prisma as unknown as PrismaService,
        jwtService as unknown as JwtService,
        { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
      );
      return { service, jwtService, prisma };
    }

    it('verifica el refresh con JWT_REFRESH_SECRET, nunca con el secreto de access', async () => {
      const { service, jwtService } = makeService({
        verifyReturn: { sub: 1, correo: 'a@uvg.edu', tipo: 'refresh' },
        registro: { idTokenRefresco: 1, revocadoEn: null, expiraEn: new Date(Date.now() + 60_000) },
      });

      await service.refreshToken('token-viejo');

      expect(jwtService.verify).toHaveBeenCalledWith('token-viejo', { secret: 'test-refresh-secret' });
    });

    it('rota el token: revoca el usado y emite un par nuevo', async () => {
      const { service, prisma } = makeService({
        verifyReturn: { sub: 1, correo: 'a@uvg.edu', tipo: 'refresh' },
        registro: { idTokenRefresco: 42, revocadoEn: null, expiraEn: new Date(Date.now() + 60_000) },
      });

      const result = await service.refreshToken('token-viejo');

      expect(prisma.tokenRefresco.update).toHaveBeenCalledWith({
        where: { idTokenRefresco: 42 },
        data: { revocadoEn: expect.any(Date) },
      });
      expect(result).toEqual({ accessToken: 'token-nuevo', refreshToken: 'token-nuevo' });
    });

    it('rechaza un refresh ya revocado', async () => {
      const { service } = makeService({
        verifyReturn: { sub: 1, correo: 'a@uvg.edu', tipo: 'refresh' },
        registro: { idTokenRefresco: 1, revocadoEn: new Date(), expiraEn: new Date(Date.now() + 60_000) },
      });

      await expect(service.refreshToken('token-usado')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un refresh expirado (expiraEn en el pasado)', async () => {
      const { service } = makeService({
        verifyReturn: { sub: 1, correo: 'a@uvg.edu', tipo: 'refresh' },
        registro: { idTokenRefresco: 1, revocadoEn: null, expiraEn: new Date(Date.now() - 1000) },
      });

      await expect(service.refreshToken('token-viejo')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un token cuya firma no verifica (invalido o expirado a nivel JWT)', async () => {
      const { service } = makeService({ verifyThrows: true });

      await expect(service.refreshToken('token-basura')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un access token no es aceptado como refresh token (tipo distinto de "refresh")', async () => {
      const { service, prisma } = makeService({
        verifyReturn: { sub: 1, correo: 'a@uvg.edu', tipo: 'access' },
      });

      await expect(service.refreshToken('access-token-real')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.tokenRefresco.findUnique).not.toHaveBeenCalled();
    });
  });
});
