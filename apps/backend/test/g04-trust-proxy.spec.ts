import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import {
  MAX_TRUST_PROXY_HOPS,
  parseTrustProxyHops,
  validateEnvironment,
} from '../src/config/environment.validation';
import { applyTrustProxy } from '../src/config/trust-proxy';
import { appThrottlerOptions, postJson, startAuthHarness, type HarnessApp } from './helpers/auth-http-harness';
import { loadWorkflow, readRepoFile } from './helpers/workflow-yaml';

/**
 * G04-C08 · OWASP25-C021 + D2. TRUST_PROXY_HOPS: entero >= 0, default 0.
 * Con 0, X-Forwarded-For no cambia la IP que ve el throttler (comportamiento
 * actual); con 1, Express toma la IP que reporta el proxy inmediato. El
 * default versionado (deploy, .env.example, validador) es 0.
 */

const LOGIN_LIMIT = 5;
let harness: HarnessApp | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function startWithHops(hops: number) {
  harness = await startAuthHarness({
    throttler: appThrottlerOptions(AppModule),
    authService: { login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) },
    configure: (app) => applyTrustProxy(app, hops),
  });
  return harness.url;
}

async function loginStatuses(url: string, forwardedFor: (index: number) => string | undefined, count: number) {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const xff = forwardedFor(index);
    const headers: Record<string, string> = xff ? { 'x-forwarded-for': xff } : {};
    statuses.push((await postJson(`${url}/auth/login`, { correo: 'a@uvg.edu.gt', contrasena: 'x' }, headers)).status);
  }
  return statuses;
}

describe('G04-C08: contrato TRUST_PROXY_HOPS', () => {
  it.each<[string | undefined, number]>([
    [undefined, 0],
    ['0', 0],
    ['1', 1],
    [String(MAX_TRUST_PROXY_HOPS), MAX_TRUST_PROXY_HOPS],
  ])('acepta %s → %s', (value, expected) => {
    expect(parseTrustProxyHops(value)).toBe(expected);
  });

  it.each(['-1', 'abc', '1.5', '0x1', 'true', String(MAX_TRUST_PROXY_HOPS + 1)])('rechaza %s', (value) => {
    expect(() => parseTrustProxyHops(value)).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('el validador del entorno: ausente o vacío = 0; inválido falla el arranque', () => {
    const base = { FRONTEND_URL: 'http://localhost:3000', JWT_SECRET: 'x'.repeat(48) };
    expect(validateEnvironment(base).app.trustProxyHops).toBe(0);
    expect(validateEnvironment({ ...base, TRUST_PROXY_HOPS: '  ' }).app.trustProxyHops).toBe(0);
    expect(validateEnvironment({ ...base, TRUST_PROXY_HOPS: '1' }).app.trustProxyHops).toBe(1);
    expect(() => validateEnvironment({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('hops 0: X-Forwarded-For se ignora; rotarlo no evita el 429', async () => {
    const url = await startWithHops(0);
    const statuses = await loginStatuses(url, (i) => `203.0.113.${i + 1}`, LOGIN_LIMIT + 1);
    expect(statuses.slice(0, LOGIN_LIMIT).every((status) => status === 201)).toBe(true);
    expect(statuses[LOGIN_LIMIT]).toBe(429);
  });

  it('hops 1 (proxy simulado): la IP del proxy inmediato define el cubo', async () => {
    const url = await startWithHops(1);
    // El "proxy" reporta clientes distintos: cubos distintos, ninguno llega al límite.
    expect(await loginStatuses(url, (i) => `203.0.113.${i + 1}`, LOGIN_LIMIT + 1)).not.toContain(429);
    // El mismo cliente reportado repetidamente sí llega al límite.
    const mismo = await loginStatuses(url, () => '198.51.100.7', LOGIN_LIMIT + 1);
    expect(mismo[LOGIN_LIMIT]).toBe(429);
  });

  it('main.ts aplica el valor validado (app.trustProxyHops) antes de escuchar', () => {
    const main = readRepoFile('apps/backend/src/main.ts');
    const apply = main.indexOf("applyTrustProxy(app, configService.get<number>('app.trustProxyHops', 0))");
    expect(apply).toBeGreaterThan(main.indexOf('app.get(ConfigService)'));
    expect(apply).toBeLessThan(main.indexOf('await app.listen('));
  });

  it('el default versionado es 0 en deploy.yml y .env.example', () => {
    expect(readRepoFile('.github/workflows/deploy.yml')).toContain("TRUST_PROXY_HOPS: ${{ vars.TRUST_PROXY_HOPS || '0' }}");
    expect(readRepoFile('.env.example')).toMatch(/^TRUST_PROXY_HOPS=0$/m);
  });

  it('el deploy rechaza un TRUST_PROXY_HOPS inválido antes de escribir o enviar el .env', () => {
    const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.name === 'Transferir .env de produccion por stdin');
    const runnerTemp = mkdtempSync(join(tmpdir(), 'g04-hops-'));
    try {
      const env: Record<string, string> = { PATH: process.env.PATH ?? '', RUNNER_TEMP: runnerTemp };
      for (const name of Object.keys(step?.env ?? {})) {
        env[name] = `synthetic-${name.toLowerCase()}`;
      }
      env.TRUST_PROXY_HOPS = '1; rm -rf /';
      const result = spawnSync('bash', ['-c', step?.run ?? 'exit 99'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('TRUST_PROXY_HOPS debe ser un entero');
      expect(spawnSync('test', ['-e', join(runnerTemp, 'deploy-env')]).status).not.toBe(0);
    } finally {
      rmSync(runnerTemp, { recursive: true, force: true });
    }
  });
});
