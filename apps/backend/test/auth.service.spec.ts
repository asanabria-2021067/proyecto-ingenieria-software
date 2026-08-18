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

describe('AuthService', () => {
  it('login retorna token cuando credenciales son validas', async () => {
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1, correo: 'a@uvg.edu', contrasena: 'hash' }) },
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
});
