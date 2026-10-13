import { Body, Controller, Post } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { appThrottlerOptions, postJson, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';

/**
 * G04-C01 · OWASP25-C022. Registro tiene un throttle dedicado (5/min por
 * cliente), probado con peticiones HTTP reales contra el ThrottlerGuard y la
 * configuración real de AppModule.
 */

const REGISTER_LIMIT = 5;
const nuevoUsuario = {
  correo: 'nuevo@uvg.edu.gt',
  contrasena: 'Segura123!',
  nombre: 'Nuevo',
  apellido: 'Usuario',
  carne: '24001',
  idCarrera: 1,
  semestre: 1,
};

let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function burst(url: string, count: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) {
    statuses.push((await postJson(`${url}/auth/register`, nuevoUsuario)).status);
  }
  return statuses;
}

describe('G04-C01: throttle dedicado a registro', () => {
  it('bajo el límite registra normalmente; la petición 6 del mismo cliente en un minuto recibe 429', async () => {
    const register = vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    harness = await startAuthHarness({ throttler: appThrottlerOptions(AppModule), authService: { register } });

    const statuses = await burst(harness.url, REGISTER_LIMIT + 1);

    expect(statuses.slice(0, REGISTER_LIMIT)).toEqual(Array(REGISTER_LIMIT).fill(201));
    expect(statuses[REGISTER_LIMIT]).toBe(429);
    // La petición bloqueada nunca llega a crear la cuenta.
    expect(register).toHaveBeenCalledTimes(REGISTER_LIMIT);
  });

  it('la respuesta normal conserva el contrato (201 + mensaje, sin cookies de sesión)', async () => {
    harness = await startAuthHarness({
      throttler: appThrottlerOptions(AppModule),
      authService: { register: vi.fn().mockResolvedValue({ idUsuario: 9, estado: 'PENDIENTE_VERIFICACION' }) },
    });

    const response = await fetch(`${harness.url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nuevoUsuario),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      mensaje: 'Cuenta creada. Queda pendiente de verificación por administración',
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('fixture negativo: sin @Throttle dedicado, la misma ráfaga pasa completa (solo quedan los buckets globales)', async () => {
    @Controller('auth')
    class RegistroSinThrottle {
      @Post('register')
      register(@Body() _body: unknown) {
        return { mensaje: 'Cuenta creada' };
      }
    }
    harness = await startAuthHarness({
      throttler: appThrottlerOptions(AppModule),
      authService: {},
      controllers: [RegistroSinThrottle],
    });

    expect(await burst(harness.url, REGISTER_LIMIT + 1)).toEqual(Array(REGISTER_LIMIT + 1).fill(201));
  });
});
