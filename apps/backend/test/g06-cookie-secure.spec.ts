import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { parseCookieSecure, validateEnvironment } from '../src/config/environment.validation';
import { appThrottlerOptions, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';
import { loadWorkflow, readRepoFile } from './helpers/workflow-yaml';

/**
 * G06-C07 · OWASP25-C049 parcial. COOKIE_SECURE: default false en código (cookies como
 * hoy); true añade Secure conservando HttpOnly, SameSite=Lax y Path=/. El
 * validador y el deploy solo aceptan true|false. Desde IESUC-568 (RTF 3.8) el
 * deploy usa true por defecto y producción no arranca sin true.
 */

let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
});

async function loginCookies(cookieSecure: string | undefined): Promise<string[]> {
  if (cookieSecure === undefined) {
    vi.stubEnv('COOKIE_SECURE', '');
  } else {
    vi.stubEnv('COOKIE_SECURE', cookieSecure);
  }
  harness = await startAuthHarness({
    throttler: appThrottlerOptions(AppModule),
    authService: { login: vi.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }) },
  });
  const response = await fetch(`${harness.url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: 'a@uvg.edu.gt', contrasena: 'x' }),
  });
  return response.headers.getSetCookie();
}

function attributes(cookie: string): Set<string> {
  return new Set(
    cookie
      .split(';')
      .slice(1)
      .map((part) => part.trim().split('=')[0].toLowerCase()),
  );
}

describe('G06-C07: COOKIE_SECURE', () => {
  it.each<[string | undefined, boolean]>([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true],
  ])('parseCookieSecure(%j) → %s', (value, expected) => {
    expect(parseCookieSecure(value)).toBe(expected);
  });

  it.each(['TRUE', 'yes', '1', 'on', 'true '])('rechaza %j (parser estricto)', (value) => {
    expect(() => parseCookieSecure(value)).toThrow(/COOKIE_SECURE/);
  });

  it('el validador del entorno: default false, true aceptado, inválido falla el arranque', () => {
    const base = { FRONTEND_URL: 'http://localhost:3000', JWT_SECRET: 'x'.repeat(48) };
    expect(validateEnvironment(base).app.cookieSecure).toBe(false);
    expect(validateEnvironment({ ...base, COOKIE_SECURE: 'true' }).app.cookieSecure).toBe(true);
    expect(() => validateEnvironment({ ...base, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
  });

  // IESUC-568 (RTF 2 · 3.8): en producción Secure es obligatorio.
  it.each([undefined, '', 'false'])('NODE_ENV=production con COOKIE_SECURE=%j falla al arrancar', (value) => {
    const base = { FRONTEND_URL: 'http://localhost:3000', JWT_SECRET: 'x'.repeat(48), NODE_ENV: 'production' };
    const raw = value === undefined ? base : { ...base, COOKIE_SECURE: value };
    expect(() => validateEnvironment(raw)).toThrow('COOKIE_SECURE must be true when NODE_ENV=production');
  });

  it('NODE_ENV=production con COOKIE_SECURE=true arranca; fuera de producción false sigue permitido', () => {
    const base = { FRONTEND_URL: 'http://localhost:3000', JWT_SECRET: 'x'.repeat(48) };
    expect(validateEnvironment({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).app.cookieSecure).toBe(true);
    for (const nodeEnv of ['development', 'test']) {
      expect(validateEnvironment({ ...base, NODE_ENV: nodeEnv, COOKIE_SECURE: 'false' }).app.cookieSecure).toBe(false);
    }
  });

  it.each([undefined, 'false'])('COOKIE_SECURE=%j: cookies actuales (HttpOnly, SameSite=Lax, Path=/, sin Secure)', async (value) => {
    const cookies = await loginCookies(value);
    expect(cookies.map((cookie) => cookie.split('=')[0])).toEqual(['access_token', 'refresh_token']);
    for (const cookie of cookies) {
      const attrs = attributes(cookie);
      expect(attrs.has('httponly')).toBe(true);
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(attrs.has('secure')).toBe(false);
    }
  });

  it('COOKIE_SECURE=true: añade Secure y conserva HttpOnly y SameSite=Lax', async () => {
    const cookies = await loginCookies('true');
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      const attrs = attributes(cookie);
      expect(attrs.has('secure')).toBe(true);
      expect(attrs.has('httponly')).toBe(true);
      expect(cookie).toContain('SameSite=Lax');
    }
  });

  describe('deploy', () => {
    const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.name === 'Transferir .env de produccion por stdin');

    it("flag con default 'true' escrito en el .env y documentado (IESUC-568, RTF 3.8)", () => {
      expect(step?.env?.COOKIE_SECURE).toBe("${{ vars.COOKIE_SECURE || 'true' }}");
      expect(step?.run).toContain(`printf 'COOKIE_SECURE=%s\\n' "$COOKIE_SECURE"`);
      expect(readRepoFile('.env.example')).toMatch(/^COOKIE_SECURE=true$/m);
    });

    it.each(['TRUE', 'yes', 'true; rm -rf /'])('rechaza COOKIE_SECURE=%j antes de escribir el .env', (value) => {
      const runnerTemp = mkdtempSync(join(tmpdir(), 'g06-cookie-'));
      try {
        const env: Record<string, string> = { PATH: process.env.PATH ?? '', RUNNER_TEMP: runnerTemp };
        for (const key of Object.keys(step?.env ?? {})) {
          env[key] = `synthetic-${key.toLowerCase()}`;
        }
        Object.assign(env, { TRUST_PROXY_HOPS: '0', BACKEND_BIND: '0.0.0.0', FRONTEND_BIND: '0.0.0.0', COOKIE_SECURE: value });
        const result = spawnSync('bash', ['-c', step?.run ?? 'exit 99'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('COOKIE_SECURE solo admite true o false');
        expect(spawnSync('test', ['-e', join(runnerTemp, 'deploy-env')]).status).not.toBe(0);
      } finally {
        rmSync(runnerTemp, { recursive: true, force: true });
      }
    });
  });
});
