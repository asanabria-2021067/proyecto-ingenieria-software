import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService, UNKNOWN_USER_PASSWORD_HASH } from '../src/auth/auth.service';

/**
 * G04-C02 · OWASP25-C023. Un correo inexistente hace el MISMO trabajo bcrypt
 * (cost 10) que un correo existente con contraseña incorrecta, y ambos
 * terminan en la misma respuesta pública: el tiempo y el mensaje no revelan
 * si la cuenta existe. Aquí bcrypt es el real (sin mock).
 */

// bcrypt REAL; solo se envuelve `compare` para observar sus llamadas.
vi.mock('bcryptjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcryptjs')>();
  return { ...actual, compare: vi.fn(actual.compare) };
});

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const REGISTER_COST = 10;

function serviceWith(usuario: Record<string, unknown> | null) {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(usuario), update: vi.fn().mockResolvedValue({}) },
    tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
    { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
  );
  return { service, prisma };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(UnauthorizedException);
  return { status: (error as UnauthorizedException).getStatus(), body: (error as UnauthorizedException).getResponse() };
}

describe('G04-C02: trabajo criptográfico equivalente en login', () => {
  it('el hash ficticio es un bcrypt válido con el mismo cost que las contraseñas reales', () => {
    expect(bcrypt.getRounds(UNKNOWN_USER_PASSWORD_HASH)).toBe(REGISTER_COST);
    expect(bcrypt.compareSync('Credenciales invalidas', UNKNOWN_USER_PASSWORD_HASH)).toBe(false);
  });

  it('usuario inexistente y contraseña incorrecta ejecutan bcrypt.compare y responden igual', async () => {
    const compare = bcrypt.compare as unknown as Mock;
    compare.mockClear();
    const existente = { idUsuario: 1, correo: 'a@uvg.edu.gt', contrasena: bcrypt.hashSync('Correcta123', REGISTER_COST), estado: 'ACTIVO' };

    const desconocido = await failure(serviceWith(null).service.login({ correo: 'x@uvg.edu.gt', contrasena: 'Intento123' }));
    expect(compare).toHaveBeenLastCalledWith('Intento123', UNKNOWN_USER_PASSWORD_HASH);

    const incorrecta = await failure(serviceWith(existente).service.login({ correo: 'a@uvg.edu.gt', contrasena: 'Intento123' }));
    expect(compare).toHaveBeenLastCalledWith('Intento123', existente.contrasena);

    expect(compare).toHaveBeenCalledTimes(2);
    expect(desconocido).toEqual(incorrecta);
  });

  it('el usuario inexistente no emite tokens ni toca la base más allá de la búsqueda', async () => {
    const { service, prisma } = serviceWith(null);
    await failure(service.login({ correo: 'x@uvg.edu.gt', contrasena: 'Intento123' }));
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });
});
