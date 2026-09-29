import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { EstadoUsuario } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { ChatModule } from '../src/chat/chat.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { extractWsToken, WsAuthService, type WsHandshake } from '../src/ws-auth/ws-auth.service';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * G07-C01 · OWASP25-C025 (conserva C002/C005). Una sola política de
 * autenticación del handshake WebSocket con la misma regla que el HTTP
 * (JwtStrategy): firma con el secreto de G01, tipo `access` y cuenta ACTIVO
 * leída de la base en cada conexión. Se firman tokens reales con
 * JwtService; solo Prisma es un doble.
 */

const REFRESH_SECRET = 'g07-refresh-secret-sintetico-distinto-del-access';
const jwt = new JwtService({ secret: SYNTHETIC_JWT_SECRET });

function sign(payload: Record<string, unknown>, options: { secret?: string; expiresIn?: number } = {}) {
  return jwt.sign(payload, { secret: options.secret ?? SYNTHETIC_JWT_SECRET, expiresIn: options.expiresIn ?? 3600 });
}

function makePolicy(estados: Record<number, EstadoUsuario> = { 7: EstadoUsuario.ACTIVO }) {
  const findUnique = vi.fn(async ({ where }: { where: { idUsuario: number } }) =>
    estados[where.idUsuario] ? { estado: estados[where.idUsuario] } : null,
  );
  const prisma = { usuario: { findUnique } } as unknown as PrismaService;
  return { policy: new WsAuthService(new JwtService({ secret: SYNTHETIC_JWT_SECRET }), prisma), findUnique, estados };
}

function handshake(token: string | undefined, via: 'auth' | 'bearer' | 'cookie' = 'auth'): WsHandshake {
  if (token === undefined) {
    return { auth: {}, headers: {} };
  }
  if (via === 'bearer') {
    return { auth: {}, headers: { authorization: `Bearer ${token}` } };
  }
  if (via === 'cookie') {
    return { auth: {}, headers: { cookie: `otra=1; access_token=${encodeURIComponent(token)}` } };
  }
  return { auth: { token }, headers: {} };
}

const accessToken = (sub = 7) => sign({ sub, correo: 'ws@uvg.edu.gt', tipo: 'access' });

describe('G07-C01: política compartida de autenticación WebSocket', () => {
  describe('T09: access token + cuenta ACTIVO', () => {
    it.each(['auth', 'bearer', 'cookie'] as const)('se acepta por %s y devuelve el usuario del token', async (via) => {
      const { policy, findUnique } = makePolicy();

      await expect(policy.authenticate(handshake(accessToken(), via))).resolves.toEqual({ ok: true, userId: 7 });
      expect(findUnique).toHaveBeenCalledWith({ where: { idUsuario: 7 }, select: { estado: true } });
    });
  });

  describe('T10: tokens que no son de acceso', () => {
    it('un token de reset (mismo secreto que el access) se rechaza por tipo y no consulta la base', async () => {
      const { policy, findUnique } = makePolicy();
      const reset = sign({ sub: 7, correo: 'ws@uvg.edu.gt', tipo: 'reset', idSolicitud: 3 });

      await expect(policy.authenticate(handshake(reset))).resolves.toEqual({ ok: false, motivo: 'TIPO_NO_ACCESS' });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('un refresh token (secreto de refresh) no verifica con el secreto de acceso', async () => {
      const { policy, findUnique } = makePolicy();
      const refresh = sign({ sub: 7, correo: 'ws@uvg.edu.gt', tipo: 'refresh', jti: 'x' }, { secret: REFRESH_SECRET });

      await expect(policy.authenticate(handshake(refresh, 'cookie'))).resolves.toEqual({ ok: false, motivo: 'TOKEN_INVALIDO' });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('aunque ambos secretos coincidieran, un refresh se rechaza por tipo', async () => {
      const { policy } = makePolicy();
      const refresh = sign({ sub: 7, correo: 'ws@uvg.edu.gt', tipo: 'refresh', jti: 'x' });

      await expect(policy.authenticate(handshake(refresh))).resolves.toEqual({ ok: false, motivo: 'TIPO_NO_ACCESS' });
    });

    it('un token sin tipo (formato previo a G04) se rechaza igual que en HTTP', async () => {
      const { policy } = makePolicy();

      await expect(policy.authenticate(handshake(sign({ sub: 7, correo: 'ws@uvg.edu.gt' })))).resolves.toEqual({
        ok: false,
        motivo: 'TIPO_NO_ACCESS',
      });
    });
  });

  describe('T11: cuenta que no está ACTIVO', () => {
    it.each([EstadoUsuario.BLOQUEADO, EstadoUsuario.INACTIVO])('%s se rechaza aunque el access token siga vigente', async (estado) => {
      const { policy } = makePolicy({ 7: estado });

      await expect(policy.authenticate(handshake(accessToken()))).resolves.toEqual({ ok: false, motivo: 'CUENTA_NO_ACTIVA' });
    });

    it('un usuario inexistente se rechaza', async () => {
      const { policy } = makePolicy({});

      await expect(policy.authenticate(handshake(accessToken(99)))).resolves.toEqual({ ok: false, motivo: 'CUENTA_NO_ACTIVA' });
    });

    it('el estado se lee en cada handshake, nunca de los claims: el mismo token deja de servir al bloquear la cuenta', async () => {
      const { policy, estados } = makePolicy();
      const token = accessToken();

      await expect(policy.authenticate(handshake(token))).resolves.toEqual({ ok: true, userId: 7 });
      estados[7] = EstadoUsuario.BLOQUEADO;
      await expect(policy.authenticate(handshake(token))).resolves.toEqual({ ok: false, motivo: 'CUENTA_NO_ACTIVA' });
    });

    it('si la consulta del estado falla, la política no autentica (falla cerrada)', async () => {
      const { policy, findUnique } = makePolicy();
      findUnique.mockRejectedValueOnce(new Error('db caída'));

      await expect(policy.authenticate(handshake(accessToken()))).rejects.toThrow('db caída');
    });
  });

  describe('tokens inválidos', () => {
    it('sin token se rechaza sin verificar nada', async () => {
      const { policy, findUnique } = makePolicy();

      await expect(policy.authenticate(handshake(undefined))).resolves.toEqual({ ok: false, motivo: 'SIN_TOKEN' });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['expirado', () => sign({ sub: 7, tipo: 'access' }, { expiresIn: -10 })],
      ['firmado con otro secreto', () => sign({ sub: 7, tipo: 'access' }, { secret: 'otro-secreto-de-al-menos-32-caracteres!!' })],
      ['sin firma (alg none)', () => `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":7,"tipo":"access"}').toString('base64url')}.`],
      ['basura', () => 'no-es-un-jwt'],
    ])('%s → TOKEN_INVALIDO', async (_caso, token) => {
      const { policy, findUnique } = makePolicy();

      await expect(policy.authenticate(handshake(token()))).resolves.toEqual({ ok: false, motivo: 'TOKEN_INVALIDO' });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('un sub que no es un entero se rechaza sin consultar la base', async () => {
      const { policy, findUnique } = makePolicy();

      await expect(policy.authenticate(handshake(sign({ sub: '7', tipo: 'access' })))).resolves.toEqual({
        ok: false,
        motivo: 'TOKEN_INVALIDO',
      });
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('extracción del token (mismas fuentes y orden que los gateways)', () => {
    it('auth.token tiene prioridad sobre Authorization y la cookie', () => {
      expect(
        extractWsToken({ auth: { token: 'a' }, headers: { authorization: 'Bearer b', cookie: 'access_token=c' } }),
      ).toBe('a');
    });

    it('sin auth.token usa Bearer y, sin Bearer, la cookie access_token', () => {
      expect(extractWsToken({ auth: {}, headers: { authorization: 'Bearer b', cookie: 'access_token=c' } })).toBe('b');
      expect(extractWsToken({ auth: {}, headers: { cookie: 'refresh_token=r; access_token=c' } })).toBe('c');
    });

    it('un Authorization que no es Bearer no se toma como token', () => {
      expect(extractWsToken({ auth: {}, headers: { authorization: 'Basic abc' } })).toBeNull();
    });

    it('la cookie refresh_token nunca se usa como credencial del socket', () => {
      expect(extractWsToken({ auth: {}, headers: { cookie: 'refresh_token=r' } })).toBeNull();
    });
  });

  describe('módulos de los gateways', () => {
    it.each([
      ['NotificationsModule', NotificationsModule],
      ['ChatModule', ChatModule],
    ])('%s provee la política con su JwtService (proveedor de G01) y Prisma', (_nombre, hostModule) => {
      expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, hostModule)).toContain(WsAuthService);
      const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, hostModule) as unknown[];
      expect(imports).toContain(PrismaModule);
      expect(imports.some((entry) => (entry as { module?: unknown }).module === JwtModule)).toBe(true);
    });
  });
});
