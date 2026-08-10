import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthController } from '../../src/auth/auth.controller';

/**
 * Seguridad — rate limiting en /auth/login y /auth/forgot-password.
 *
 * El proyecto no registra un ThrottlerGuard por ruta: aplica UN ÚNICO
 * ThrottlerGuard global (APP_GUARD en src/app.module.ts) con la misma
 * configuración de 3 buckets a TODAS las rutas, incluidas login y
 * forgot-password:
 *   short:  10 solicitudes / 1s
 *   medium: 50 solicitudes / 10s
 *   long:   200 solicitudes / 60s
 * Se replica exactamente esa configuración aquí e instanciando el guard real
 * a mano (mismo patrón del resto del repo: sin Test.createTestingModule(),
 * ver nota en password-recovery-admin.e2e.spec.ts). `onModuleInit()` se
 * invoca manualmente porque en producción lo dispara el ciclo de vida de
 * Nest, no el constructor (ver node_modules/@nestjs/throttler ThrottlerGuard).
 */

const THROTTLER_CONFIG = [
  { name: 'short', ttl: 1000, limit: 10 },
  { name: 'medium', ttl: 10000, limit: 50 },
  { name: 'long', ttl: 60000, limit: 200 },
];

function makeContext(handlerName: 'login' | 'forgotPassword', ip: string): ExecutionContext {
  const req = { ip, ips: [], headers: {} };
  const res = { header: () => undefined };
  return {
    getHandler: () => AuthController.prototype[handlerName],
    getClass: () => AuthController,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('Rate limiting global (ThrottlerGuard real) sobre /auth/login y /auth/forgot-password', () => {
  let guard: ThrottlerGuard;
  let storage: ThrottlerStorageService;

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    guard = new ThrottlerGuard(THROTTLER_CONFIG as any, storage, new Reflector());
    await guard.onModuleInit();
  });

  afterEach(() => {
    // Limpia los setTimeout internos del storage (hasta 60s por el bucket
    // "long"); si no se limpian, mantienen vivo el proceso de test.
    storage.onApplicationShutdown();
  });

  it('permite hasta 10 solicitudes/segundo a /auth/login y bloquea la 11ª con 429 (ThrottlerException)', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(makeContext('login', ip))).resolves.toBe(true);
    }

    await expect(guard.canActivate(makeContext('login', ip))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('el mismo límite global protege /auth/forgot-password (fuerza bruta de recuperación)', async () => {
    const ip = '198.51.100.20';
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(makeContext('forgotPassword', ip))).resolves.toBe(true);
    }

    await expect(guard.canActivate(makeContext('forgotPassword', ip))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('login y forgot-password para la MISMA IP se cuentan por separado (bucket por controller+handler)', async () => {
    const ip = '198.51.100.30';
    for (let i = 0; i < 10; i++) {
      await guard.canActivate(makeContext('login', ip));
    }
    await expect(guard.canActivate(makeContext('login', ip))).rejects.toBeInstanceOf(ThrottlerException);

    // forgot-password para la misma IP no está bloqueado por el consumo de login.
    await expect(guard.canActivate(makeContext('forgotPassword', ip))).resolves.toBe(true);
  });

  it('IPs distintas tienen contadores independientes (sin bloqueo cruzado entre atacante y usuario legítimo)', async () => {
    const ipAtacante = '198.51.100.40';
    const ipLegitimo = '198.51.100.41';

    for (let i = 0; i < 10; i++) {
      await guard.canActivate(makeContext('login', ipAtacante));
    }
    await expect(guard.canActivate(makeContext('login', ipAtacante))).rejects.toBeInstanceOf(
      ThrottlerException,
    );

    await expect(guard.canActivate(makeContext('login', ipLegitimo))).resolves.toBe(true);
  });
});
