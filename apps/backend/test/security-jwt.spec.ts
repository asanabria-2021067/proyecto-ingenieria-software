import { describe, expect, it, vi, type Mock } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { JwtService as JwtServiceType } from '@nestjs/jwt';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import * as bcrypt from 'bcryptjs';

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

/**
 * T-127 (IESUC-285). JwtStrategy es la implementación real de passport-jwt
 * usada por JwtAuthGuard en producción — se ejercita vía `.authenticate()`
 * (no solo `.validate()`) para que la verificación de firma/algoritmo/
 * expiración de passport-jwt/jsonwebtoken quede realmente probada, no
 * asumida.
 */

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function makeStrategy(usuario: { estado: string } | null = { estado: 'ACTIVO' }) {
  const prisma = { usuario: { findUnique: vi.fn().mockResolvedValue(usuario) } };
  return { strategy: new JwtStrategy(prisma as unknown as PrismaService), prisma };
}

interface AuthResult {
  ok: boolean;
  user?: unknown;
  info?: unknown;
}

function runAuthenticate(strategy: JwtStrategy, token: string): Promise<AuthResult> {
  return new Promise((resolve) => {
    const anyStrategy = strategy as unknown as {
      authenticate: (req: unknown) => void;
      success?: (user: unknown) => void;
      fail?: (info: unknown) => void;
      error?: (err: unknown) => void;
    };
    anyStrategy.success = (user) => resolve({ ok: true, user });
    anyStrategy.fail = (info) => resolve({ ok: false, info });
    anyStrategy.error = (err) => resolve({ ok: false, info: err });
    anyStrategy.authenticate({ headers: { authorization: `Bearer ${token}` } });
  });
}

function signValidAccessToken(overrides: Record<string, unknown> = {}) {
  const jwtService = new JwtService({ secret: SECRET });
  return jwtService.sign({ sub: 1, correo: 'a@uvg.edu.gt', ...overrides }, { expiresIn: '45m' });
}

function base64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('JwtStrategy — seguridad de tokens', () => {
  it('acepta un access token válido de un usuario ACTIVO', async () => {
    const { strategy } = makeStrategy({ estado: 'ACTIVO' });
    const token = signValidAccessToken();

    const result = await runAuthenticate(strategy, token);

    expect(result.ok).toBe(true);
    expect(result.user).toEqual({ userId: 1, correo: 'a@uvg.edu.gt' });
  });

  it('rechaza un token con la firma alterada', async () => {
    const { strategy } = makeStrategy();
    const token = signValidAccessToken();
    const [header, payload, signature] = token.split('.');
    const tamperedSignature = signature.split('').reverse().join('');
    const tampered = `${header}.${payload}.${tamperedSignature}`;

    const result = await runAuthenticate(strategy, tampered);

    expect(result.ok).toBe(false);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const { strategy } = makeStrategy();
    const otroSecreto = new JwtService({ secret: 'otro-secreto-cualquiera' });
    const token = otroSecreto.sign({ sub: 1, correo: 'a@uvg.edu.gt' }, { expiresIn: '45m' });

    const result = await runAuthenticate(strategy, token);

    expect(result.ok).toBe(false);
  });

  it('rechaza un token con algoritmo "none"', async () => {
    const { strategy } = makeStrategy();
    const header = base64url({ alg: 'none', typ: 'JWT' });
    const body = base64url({ sub: 1, correo: 'a@uvg.edu.gt' });
    const token = `${header}.${body}.`;

    const result = await runAuthenticate(strategy, token);

    expect(result.ok).toBe(false);
  });

  it('rechaza un token vencido', async () => {
    const { strategy } = makeStrategy();
    const jwtService = new JwtService({ secret: SECRET });
    const token = jwtService.sign({ sub: 1, correo: 'a@uvg.edu.gt' }, { expiresIn: '-10s' });

    const result = await runAuthenticate(strategy, token);

    expect(result.ok).toBe(false);
  });

  it('rechaza un payload manipulado para cambiar "sub" sin volver a firmar (firma ya no coincide)', async () => {
    const { strategy } = makeStrategy();
    const token = signValidAccessToken();
    const [header, , signature] = token.split('.');
    const payloadOriginal = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const payloadManipulado = base64url({ ...payloadOriginal, sub: 999 });
    const tampered = `${header}.${payloadManipulado}.${signature}`;

    const result = await runAuthenticate(strategy, tampered);

    expect(result.ok).toBe(false);
  });

  it('rechaza el token de recuperación de contraseña (HU-14) como credencial de sesión', async () => {
    const { strategy, prisma } = makeStrategy();
    const jwtService = new JwtService({ secret: SECRET });
    const resetToken = jwtService.sign(
      { sub: 1, correo: 'a@uvg.edu.gt', tipo: 'reset', idSolicitud: 5 },
      { expiresIn: '1h' },
    );

    const result = await runAuthenticate(strategy, resetToken);

    expect(result.ok).toBe(false);
    // El rechazo ocurre por el tipo de token, antes de tocar la base de datos.
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza un token cuyo usuario ya no existe', async () => {
    const { strategy } = makeStrategy(null);
    const token = signValidAccessToken();

    const result = await runAuthenticate(strategy, token);

    expect(result.ok).toBe(false);
  });

  it.each(['INACTIVO', 'BLOQUEADO'])(
    'rechaza un token válido de un usuario con estado %s',
    async (estado) => {
      const { strategy } = makeStrategy({ estado });
      const token = signValidAccessToken();

      const result = await runAuthenticate(strategy, token);

      expect(result.ok).toBe(false);
    },
  );
});

describe('AuthService — contenido del payload emitido', () => {
  it('el payload firmado en login no lleva la contraseña ni su hash', async () => {
    const prisma = {
      usuario: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ idUsuario: 1, correo: 'a@uvg.edu.gt', contrasena: 'hash-secreto' }),
      },
    };
    const sign = vi.fn().mockReturnValue('token');
    const jwtService = { sign } as unknown as JwtServiceType;
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService,
      { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
    );

    await service.login({ correo: 'a@uvg.edu.gt', contrasena: '123456' });

    for (const call of sign.mock.calls) {
      const payload = call[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('contrasena');
      expect(JSON.stringify(payload).toLowerCase()).not.toContain('hash');
    }
  });

  it('el payload firmado en register no lleva la contraseña ni su hash', async () => {
    const tx = {
      usuario: {
        create: vi.fn().mockResolvedValue({ idUsuario: 7, correo: 'n@uvg.edu.gt' }),
      },
      perfilEstudiante: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)),
    };
    const sign = vi.fn().mockReturnValue('token');
    const jwtService = { sign } as unknown as JwtServiceType;
    (bcrypt.hash as Mock).mockResolvedValue('hashed');
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService,
      { notifyAdminsFromTemplate: vi.fn() } as unknown as NotificationsService,
    );

    await service.register({
      correo: 'n@uvg.edu.gt',
      contrasena: '123456',
      nombre: 'Nuevo',
      apellido: 'User',
      carne: '1',
      idCarrera: 2,
      semestre: 4,
    });

    for (const call of sign.mock.calls) {
      const payload = call[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('contrasena');
    }
  });
});
