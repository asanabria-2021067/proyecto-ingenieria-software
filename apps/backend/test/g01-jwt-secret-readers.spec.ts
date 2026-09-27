import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DynamicModule, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

/**
 * G01-C03/C04 · OWASP25-C019. Todo lector de JWT_SECRET usa el proveedor
 * validado de `src/config/jwt-secret.ts`: ningún fallback predecible y fallo
 * cerrado cuando el secreto falta. No cambia algoritmos, expiraciones ni
 * tipos de token (ver security-jwt.spec.ts y auth.service.spec.ts).
 */

const SRC = join(__dirname, '../src');
const PREDICTABLE_FALLBACK = 'dev-secret-change-me';
const REQUIRED = 'JWT_SECRET environment variable is required';

const AUTH_READERS = ['auth/auth.module.ts', 'auth/jwt.strategy.ts', 'auth/auth.service.ts'];

interface JwtOptionsProvider {
  provide: unknown;
  useFactory: (config: ConfigService) => unknown;
}

function jwtOptionsFactory(hostModule: Type<unknown>): JwtOptionsProvider['useFactory'] {
  const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, hostModule) ?? []) as unknown[];
  const jwt = imports.find(
    (entry): entry is DynamicModule =>
      typeof entry === 'object' && entry !== null && (entry as DynamicModule).module === JwtModule,
  );
  const provider = (jwt?.providers ?? []).find(
    (candidate): candidate is JwtOptionsProvider =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as JwtOptionsProvider).provide === 'JWT_MODULE_OPTIONS',
  );
  if (!provider) {
    throw new Error(`${hostModule.name} no registra JwtModule.registerAsync`);
  }
  return provider.useFactory;
}

describe('G01-C03: Auth usa el proveedor JWT validado', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it.each(AUTH_READERS)('%s no contiene el fallback predecible y lee del proveedor', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source).not.toContain(PREDICTABLE_FALLBACK);
    expect(source).not.toMatch(/process\.env\.JWT_SECRET/);
    expect(source).toMatch(/from ['"]\.\.\/config\/jwt-secret['"]/);
  });

  it('AuthModule firma con el secreto del ConfigService y falla cerrado sin él', () => {
    const factory = jwtOptionsFactory(AuthModule);
    delete process.env.JWT_SECRET;
    expect(factory(new ConfigService({ JWT_SECRET: SYNTHETIC_JWT_SECRET }))).toEqual({
      secret: SYNTHETIC_JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    });
    expect(() => factory(new ConfigService({}))).toThrow(REQUIRED);
  });

  it('JwtStrategy no se construye sin un JWT_SECRET válido', () => {
    const prisma = { usuario: { findUnique: vi.fn() } } as unknown as PrismaService;
    expect(() => new JwtStrategy(prisma)).not.toThrow();

    delete process.env.JWT_SECRET;
    expect(() => new JwtStrategy(prisma)).toThrow(REQUIRED);

    process.env.JWT_SECRET = PREDICTABLE_FALLBACK;
    expect(() => new JwtStrategy(prisma)).toThrow();
  });

  it('AuthService firma el access token con el secreto validado y no emite tokens sin él', async () => {
    const usuario = { idUsuario: 3, correo: 'qa@uvg.edu.gt', contrasena: 'hash' };
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue(usuario) },
      tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const jwtService = new JwtService({});
    const service = new AuthService(prisma, jwtService, {} as NotificationsService);
    (bcrypt.compare as Mock).mockResolvedValue(true);

    const { accessToken } = await service.login({ correo: usuario.correo, contrasena: 'x' });
    expect(jwtService.verify(accessToken, { secret: SYNTHETIC_JWT_SECRET })).toMatchObject({
      sub: 3,
      tipo: 'access',
    });

    delete process.env.JWT_SECRET;
    await expect(service.login({ correo: usuario.correo, contrasena: 'x' })).rejects.toThrow(REQUIRED);
    // Sin secreto no se persiste ningún refresh token nuevo.
    expect((prisma.tokenRefresco.create as Mock).mock.calls).toHaveLength(1);
  });
});
