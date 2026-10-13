import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { isThrottlerDisabled } from '../src/config/throttler';
import { appThrottlerOptions, postJson, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';

let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
});

async function logoutBurst(): Promise<number[]> {
  harness = await startAuthHarness({
    throttler: appThrottlerOptions(AppModule),
    authService: { logout: vi.fn().mockResolvedValue(undefined) },
  });
  const url = harness.url;
  const burst = await Promise.all(Array.from({ length: 15 }, () => postJson(`${url}/auth/logout`, {})));
  return burst.map((response) => response.status);
}

describe('THROTTLER_DISABLED', () => {
  it('por defecto el limitador sigue activo', () => {
    expect(isThrottlerDisabled({})).toBe(false);
    expect(isThrottlerDisabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isThrottlerDisabled({ NODE_ENV: 'development', THROTTLER_DISABLED: 'false' })).toBe(false);
    expect(isThrottlerDisabled({ NODE_ENV: 'development', THROTTLER_DISABLED: '1' })).toBe(false);
  });

  it('solo se apaga con el valor exacto true fuera de producción', () => {
    expect(isThrottlerDisabled({ NODE_ENV: 'development', THROTTLER_DISABLED: 'true' })).toBe(true);
    expect(isThrottlerDisabled({ NODE_ENV: 'test', THROTTLER_DISABLED: 'true' })).toBe(true);
  });

  it('en producción se ignora y el limitador sigue activo', () => {
    expect(isThrottlerDisabled({ NODE_ENV: 'production', THROTTLER_DISABLED: 'true' })).toBe(false);
  });

  it('con la variable activa una ráfaga real no recibe 429', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('THROTTLER_DISABLED', 'true');
    expect(await logoutBurst()).not.toContain(429);
  });

  it('con la variable activa en producción la misma ráfaga sí recibe 429', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('THROTTLER_DISABLED', 'true');
    expect(await logoutBurst()).toContain(429);
  });
});
