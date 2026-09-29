import * as bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});
import type { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AccountAttemptsService } from '../src/auth/account-attempts.service';
import { applyTrustProxy } from '../src/config/trust-proxy';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import { securityRequestContext } from '../src/security-events/request-context';
import { appThrottlerOptions, postJson, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';

/**
 * G05-C09 · OWASP25-C037 + C021. Los eventos de seguridad guardan `req.ip` y
 * una marca `ipTrusted` coherente con el trust proxy REAL de Express
 * (TRUST_PROXY_HOPS de G04): con hops 0 la IP es la del socket y no se marca
 * como confiable (X-Forwarded-For se ignora); con hops 1 es la del cliente
 * que informa el proxy y se marca confiable. Nunca se guarda la cadena XFF.
 */

let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function loginThrough(hops: number, forwardedFor: string) {
  const create = vi.fn().mockResolvedValue({});
  const prisma = {
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ idUsuario: 3, correo: 'a@uvg.edu.gt', contrasena: bcrypt.hashSync('Correcta123', 4), estado: 'ACTIVO' }),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    bitacoraAuditoria: { create },
  };
  const auth = new AuthService(
    prisma as unknown as PrismaService,
    { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
    {} as NotificationsService,
    new AccountAttemptsService(),
    undefined,
    new SecurityEventsService(prisma as unknown as PrismaService),
  );
  harness = await startAuthHarness({
    throttler: appThrottlerOptions(AppModule),
    authService: auth,
    configure: (app) => applyTrustProxy(app, hops),
  });
  const headers = { 'x-forwarded-for': forwardedFor };
  await postJson(`${harness.url}/auth/login`, { correo: 'a@uvg.edu.gt', contrasena: 'mala' }, headers);
  await postJson(`${harness.url}/auth/login`, { correo: 'a@uvg.edu.gt', contrasena: 'Correcta123' }, headers);
  return create.mock.calls.map((call) => call[0].data);
}

describe('G05-C09: IP de origen con marca de confianza', () => {
  it('hops 0: IP del socket, ipTrusted=false y el X-Forwarded-For no se guarda', async () => {
    const rows = await loginThrough(0, '203.0.113.50, 10.0.0.1');
    expect(rows.map((row) => row.accion)).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCEEDED']);
    for (const row of rows) {
      expect(row.ipOrigen).toMatch(/^(127\.0\.0\.1|::ffff:127\.0\.0\.1|::1)$/);
      expect(row.detalleJson.ipTrusted).toBe(false);
    }
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113\.50|10\.0\.0\.1/);
  });

  it('hops 1 (proxy local controlado): IP que informa el proxy y ipTrusted=true, sin la cadena completa', async () => {
    const rows = await loginThrough(1, '198.51.100.20, 203.0.113.7');
    for (const row of rows) {
      expect(row.ipOrigen).toBe('203.0.113.7');
      expect(row.detalleJson.ipTrusted).toBe(true);
    }
    // La parte de la cadena que no es del salto confiable no se persiste.
    expect(JSON.stringify(rows)).not.toContain('198.51.100.20');
  });

  it('el helper deriva ipTrusted del trust proxy real; sin petición ni IP no se inventa nada', () => {
    const app = (value: unknown) => ({ get: () => value });
    expect(securityRequestContext({ ip: '1.2.3.4', app: app(1) })).toEqual({ ip: '1.2.3.4', ipTrusted: true });
    expect(securityRequestContext({ ip: '1.2.3.4', app: app(false) })).toEqual({ ip: '1.2.3.4', ipTrusted: false });
    expect(securityRequestContext({ ip: '1.2.3.4', app: app(0) })).toEqual({ ip: '1.2.3.4', ipTrusted: false });
    // `true` (confiar en toda la cadena) no es el contrato de G04: no se marca como confiable.
    expect(securityRequestContext({ ip: '1.2.3.4', app: app(true) })).toEqual({ ip: '1.2.3.4', ipTrusted: false });
    expect(securityRequestContext({})).toEqual({ ip: null, ipTrusted: false });
  });

  it('sin origen (llamadas internas) el evento no lleva IP ni marca', async () => {
    const create = vi.fn().mockResolvedValue({});
    await new SecurityEventsService({ bitacoraAuditoria: { create } } as unknown as PrismaService).record({ tipo: 'LOGIN_FAILED' });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('ipOrigen');
    expect(create.mock.calls[0][0].data.detalleJson).toEqual({});
  });
});
