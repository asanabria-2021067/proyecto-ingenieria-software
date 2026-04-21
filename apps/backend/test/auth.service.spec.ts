import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService', () => {
  it('login retorna token cuando credenciales son validas', async () => {
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1, correo: 'a@uvg.edu', contrasena: 'hash' }) },
    } as any;
    const jwtService = { sign: vi.fn().mockReturnValue('jwt-token') } as any;
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    const service = new AuthService(prisma, jwtService);

    const result = await service.login({ correo: 'a@uvg.edu', contrasena: '123456' });

    expect(result).toEqual({ accessToken: 'jwt-token' });
    compareSpy.mockRestore();
  });

  it('login falla si usuario no existe', async () => {
    const service = new AuthService(
      { usuario: { findUnique: vi.fn().mockResolvedValue(null) } } as any,
      { sign: vi.fn() } as any,
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
      $transaction: vi.fn(async (cb: (client: any) => unknown) => cb(tx)),
    } as any;
    const jwtService = { sign: vi.fn().mockReturnValue('token-register') } as any;
    const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
    const service = new AuthService(prisma, jwtService);

    const result = await service.register({
      correo: 'n@uvg.edu',
      contrasena: '123',
      nombre: 'Nuevo',
      apellido: 'User',
      carne: '1',
      idCarrera: 2,
      semestre: 4,
    });

    expect(result).toEqual({ accessToken: 'token-register' });
    expect(tx.usuario.create).toHaveBeenCalled();
    expect(tx.perfilEstudiante.create).toHaveBeenCalled();
    hashSpy.mockRestore();
  });

  it('register falla si correo ya existe', async () => {
    const service = new AuthService(
      { usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 1 }) } } as any,
      { sign: vi.fn() } as any,
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
