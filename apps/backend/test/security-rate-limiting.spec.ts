import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { appThrottlerOptions, postJson, startAuthHarness, type HarnessApp, type HarnessOptions } from './helpers/auth-http-harness';

/**
 * T-127 (IESUC-285) → G04-C09 (OWASP25-C021/C022/C036 + T15).
 *
 * Prueba tipo B. Antes, este archivo leía app.module.ts y auth.controller.ts
 * como texto y buscaba `@Throttle`/`ttl`/`limit` con expresiones regulares:
 * un decorador mal aplicado, un guard no registrado de verdad o un bucket
 * compartido pasaban esas regex sin proteger nada. Ahora cada contrato se
 * demuestra con peticiones HTTP reales contra el ThrottlerGuard y las opciones
 * REALES de AppModule (ver helpers/auth-http-harness.ts); el único chequeo
 * estructural que queda (APP_GUARD) lee la metadata de Nest, no el código
 * fuente. El fixture negativo muestra que sin el guard el contrato falla.
 */

const MAIN_SOURCE = readFileSync(join(__dirname, '../src/main.ts'), 'utf-8');

const ROUTE_LIMITS = {
  login: 5,
  register: 5,
  'forgot-password': 5,
  'reset-password': 5,
  refresh: 10,
} as const;

let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

function fakeAuthService() {
  return {
    login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    register: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    forgotPassword: vi.fn().mockResolvedValue({ mensaje: 'ok' }),
    resetPassword: vi.fn().mockResolvedValue({ mensaje: 'ok' }),
    refreshToken: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

async function start(overrides: Partial<HarnessOptions> = {}) {
  harness = await startAuthHarness({ throttler: appThrottlerOptions(AppModule), authService: fakeAuthService(), ...overrides });
  return harness.url;
}

async function statuses(url: string, route: string, count: number, headers: (i: number) => Record<string, string> = () => ({})) {
  const result: number[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push((await postJson(`${url}/auth/${route}`, {}, headers(i))).status);
  }
  return result;
}

/** Posición (1-based) de la primera respuesta 429, o null si nunca se limitó. */
export function firstThrottled(codes: number[]): number | null {
  const index = codes.indexOf(429);
  return index === -1 ? null : index + 1;
}

describe('Rate limiting global (ThrottlerGuard)', () => {
  it('AppModule registra ThrottlerGuard como APP_GUARD (metadata real, no el texto del archivo)', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as Array<{ provide?: unknown; useClass?: unknown }>;
    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: ThrottlerGuard });
  });

  it('cada bucket global declara ttl y limit razonables', () => {
    const buckets = appThrottlerOptions(AppModule) as Array<{ name: string; ttl: number; limit: number }>;
    expect(buckets.map((bucket) => bucket.name)).toEqual(['short', 'medium', 'long']);
    for (const bucket of buckets) {
      expect(bucket.ttl).toBeGreaterThan(0);
      expect(bucket.limit).toBeGreaterThan(0);
      expect(bucket.limit).toBeLessThanOrEqual(1000);
    }
  });

  it('una ruta sin límite propio (logout) cae en el bucket global corto: una ráfaga recibe 429', async () => {
    const url = await start();
    const burst = await Promise.all(Array.from({ length: 15 }, () => postJson(`${url}/auth/logout`, {})));
    expect(burst.map((response) => response.status)).toContain(429);
  });
});

describe('AuthController — cada ruta tiene su límite y ninguna se salta el throttling', () => {
  it.each(Object.entries(ROUTE_LIMITS))('%s: la petición %i+1 del mismo cliente recibe 429', async (route, limit) => {
    const url = await start();
    const codes = await statuses(url, route, limit + 1);
    expect(firstThrottled(codes)).toBe(limit + 1);
  });

  it('los buckets son por ruta: agotar login no bloquea registro', async () => {
    const url = await start();
    expect(firstThrottled(await statuses(url, 'login', ROUTE_LIMITS.login + 1))).toBe(ROUTE_LIMITS.login + 1);
    expect(await statuses(url, 'register', 1)).toEqual([201]);
  });

  it('fixture negativo: sin ThrottlerGuard la misma ráfaga nunca recibe 429 y el contrato lo detecta', async () => {
    const url = await start({ withoutThrottlerGuard: true });
    expect(firstThrottled(await statuses(url, 'login', ROUTE_LIMITS.login + 1))).toBeNull();
  });
});

describe('X-Forwarded-For y TRUST_PROXY_HOPS', () => {
  const rotating = (i: number) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` });

  it('hops 0 (default): rotar X-Forwarded-For no evade el límite', async () => {
    const url = await start({ configure: (app) => applyTrustProxy(app, 0) });
    expect(firstThrottled(await statuses(url, 'login', ROUTE_LIMITS.login + 1, rotating))).toBe(ROUTE_LIMITS.login + 1);
  });

  it('hops 1: el cliente que reporta el proxy define el bucket', async () => {
    const url = await start({ configure: (app) => applyTrustProxy(app, 1) });
    expect(firstThrottled(await statuses(url, 'login', ROUTE_LIMITS.login + 1, rotating))).toBeNull();
    const same = () => ({ 'x-forwarded-for': '198.51.100.7' });
    expect(firstThrottled(await statuses(url, 'login', ROUTE_LIMITS.login + 1, same))).toBe(ROUTE_LIMITS.login + 1);
  });

  it('el bloqueo por cuenta complementa al de IP: con IPs distintas la cuenta igual queda bloqueada', async () => {
    const hash = bcrypt.hashSync('Correcta123', 4);
    const prisma = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ idUsuario: 1, correo: 'ana@uvg.edu.gt', contrasena: hash, estado: 'ACTIVO' }),
        update: vi.fn().mockResolvedValue({}),
      },
      tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    };
    const realAuth = new AuthService(
      prisma as unknown as PrismaService,
      { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
      {} as NotificationsService,
      new AccountAttemptsService(),
    );
    const url = await start({ authService: realAuth, configure: (app) => applyTrustProxy(app, 1) });
    const login = (contrasena: string, i: number) =>
      postJson(`${url}/auth/login`, { correo: 'ana@uvg.edu.gt', contrasena }, rotating(i));

    for (let i = 0; i < 5; i += 1) {
      expect((await login('Incorrecta1', i)).status).toBe(401);
    }
    // Sexta IP distinta y contraseña correcta: el throttler por IP no la frena, el bloqueo por cuenta sí.
    const locked = await login('Correcta123', 5);
    expect(locked.status).toBe(401);
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });
});

describe('Cabeceras y validación global (main.ts)', () => {
  it('Helmet está activo', () => {
    expect(MAIN_SOURCE).toMatch(/app\.use\(helmet\(\)\)/);
  });

  it('ValidationPipe global usa whitelist y forbidNonWhitelisted', () => {
    const match = MAIN_SOURCE.match(/new ValidationPipe\(\{([\s\S]*?)\}\)/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('ValidationPipe no configurado');
    expect(match[1]).toMatch(/whitelist:\s*true/);
    expect(match[1]).toMatch(/forbidNonWhitelisted:\s*true/);
  });

  it('CORS no permite cualquier origen ("*")', () => {
    const match = MAIN_SOURCE.match(/app\.enableCors\(\{([\s\S]*?)\}\)/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('CORS no configurado');
    expect(match[1]).not.toMatch(/origin:\s*['"]\*['"]/);
    expect(match[1]).not.toMatch(/origin:\s*true\b/);
  });
});
