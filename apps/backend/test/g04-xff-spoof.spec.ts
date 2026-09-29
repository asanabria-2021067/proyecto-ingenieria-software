import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { applyTrustProxy } from '../src/config/trust-proxy';
import { appThrottlerOptions, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';
// Misma verificación que usa el arnés con nginx real (run-harness.sh).
import { SPOOF_LOGIN_LIMIT, verifySpoofResistance } from '../../../infra/staging/characterize.mjs';

/**
 * G04-C13 · OWASP25-C021 + T16. Con TRUST_PROXY_HOPS=1 detrás de un proxy que
 * agrega la dirección real al final de X-Forwarded-For (lo que hace nginx con
 * `$proxy_add_x_forwarded_for`), un cliente que falsifica X-Forwarded-For no
 * elige su cubo de rate limiting. El fixture negativo (confiar en TODA la
 * cadena) muestra que el mismo ataque sí evadiría el límite. La prueba con el
 * nginx real vive en el arnés (T16-01).
 */

let harness: HarnessApp | undefined;
let proxy: http.Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
  await harness?.close();
  harness = undefined;
  proxy = undefined;
});

/** Proxy de un salto que imita a nginx: X-Forwarded-For = <lo que mandó el cliente>, <IP real del socket>. */
async function startAppendingProxy(target: string): Promise<string> {
  const upstream = new URL(target);
  proxy = http.createServer((req, res) => {
    const previous = req.headers['x-forwarded-for'];
    const forwarded = [previous, req.socket.remoteAddress].filter(Boolean).join(', ');
    const out = http.request(
      {
        host: upstream.hostname,
        port: upstream.port,
        path: `${upstream.pathname}${req.url}`,
        method: req.method,
        headers: { ...req.headers, 'x-forwarded-for': forwarded },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    req.pipe(out);
  });
  await new Promise<void>((resolve) => proxy!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(proxy!.address() as AddressInfo).port}`;
}

async function spoofedBurst(configure: (app: INestApplication) => void): Promise<number[]> {
  harness = await startAuthHarness({
    throttler: appThrottlerOptions(AppModule),
    authService: { login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) },
    configure,
  });
  const entry = await startAppendingProxy(harness.url);
  const statuses: number[] = [];
  for (let index = 0; index <= SPOOF_LOGIN_LIMIT; index += 1) {
    const response = await fetch(`${entry}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${index + 1}` },
      body: JSON.stringify({ correo: `t16-${index}@uvg.edu.gt`, contrasena: 'x' }),
    });
    statuses.push(response.status);
  }
  return statuses;
}

describe('G04-C13: T16 anti-spoofing de X-Forwarded-For', () => {
  it('hops=1 detrás de un proxy que agrega la IP real: el XFF falso no cambia el cubo y el sexto intento recibe 429', async () => {
    const statuses = await spoofedBurst((app) => applyTrustProxy(app, 1));
    expect(verifySpoofResistance(statuses)).toEqual([]);
  });

  it('fixture negativo: confiar en toda la cadena (trust proxy = true) deja que el XFF falso evada el límite', async () => {
    const statuses = await spoofedBurst((app) => {
      (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', true);
    });
    expect(statuses).not.toContain(429);
    expect(verifySpoofResistance(statuses)).toEqual(['429 esperado en el intento 6, obtenido nunca']);
  });

  it('la verificación del arnés exige el 429 exactamente en el intento 6', () => {
    expect(verifySpoofResistance([401, 401, 401, 401, 401, 429])).toEqual([]);
    expect(verifySpoofResistance([401, 401, 401, 429, 429, 429])).toEqual(['429 esperado en el intento 6, obtenido en el 4']);
  });
});
