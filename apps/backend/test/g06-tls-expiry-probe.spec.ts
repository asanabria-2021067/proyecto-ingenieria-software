import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:tls';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';
// Script sin dependencias, el mismo que usaría el administrador.
import { DEFAULT_THRESHOLD_DAYS, evaluateExpiry, parseNotAfter, probe } from '../../../infra/tls/cert-expiry-probe.mjs';

/**
 * G06-C10 · NBD-1 operacional. Sonda read-only de expiración TLS: ALERT cuando
 * quedan menos de 21 días, EXPIRED si caducó, ERROR controlado ante fechas
 * inválidas. Fechas sintéticas y certificados autofirmados locales generados y
 * destruidos aquí; nunca producción.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-27T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const dir = mkdtempSync(join(tmpdir(), 'g06-tls-'));
function selfSigned(name: string, days: number): string {
  const cert = join(dir, `${name}.pem`);
  const result = spawnSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', String(days), '-subj', '/CN=localhost', '-keyout', join(dir, `${name}.key`), '-out', cert],
    { stdio: 'ignore' },
  );
  expect(result.status).toBe(0);
  return cert;
}

let longCert: string;
let shortCert: string;
let server: Server;
let port: number;

beforeAll(async () => {
  longCert = selfSigned('long', 90);
  shortCert = selfSigned('short', 10);
  server = createServer({ cert: readFileSync(shortCert), key: readFileSync(join(dir, 'short.key')) }, (socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe('G06-C10: sonda de expiración TLS', () => {
  it('umbral contractual de 21 días', () => {
    expect(DEFAULT_THRESHOLD_DAYS).toBe(21);
  });

  it.each<[string, number, string]>([
    ['90 días', 90, 'OK'],
    ['exactamente 21 días (no es "menos de 21")', 21, 'OK'],
    ['21 días menos 1 ms', 21 - 1 / DAY, 'ALERT'],
    ['20 días', 20, 'ALERT'],
    ['1 hora', 1 / 24, 'ALERT'],
    ['caducado hace 2 días', -2, 'EXPIRED'],
    ['caduca justo ahora', 0, 'EXPIRED'],
  ])('%s → %s', (_caso, days, status) => {
    expect(evaluateExpiry(at(days), NOW).status).toBe(status);
  });

  it('interpreta el formato de OpenSSL/Node y rechaza fechas inválidas', () => {
    expect(parseNotAfter('Dec 25 12:00:00 2026 GMT').toISOString()).toBe('2026-12-25T12:00:00.000Z');
    for (const invalid of ['', 'no-es-fecha', 'Feb 31 99:00:00 2026 GMT']) {
      expect(() => parseNotAfter(invalid)).toThrow(/ilegible/);
    }
  });

  it('archivo PEM sintético: 90 días → OK; 10 días → ALERT', async () => {
    expect((await probe(['--file', longCert])).status).toBe('OK');
    const short = await probe(['--file', shortCert]);
    expect(short.status).toBe('ALERT');
    expect(short.daysLeft).toBeLessThan(21);
  });

  it('servidor TLS local (handshake de solo lectura) con certificado de 10 días → ALERT', async () => {
    expect((await probe(['--host', '127.0.0.1', '--port', String(port)])).status).toBe('ALERT');
  });

  it('errores controlados: archivo inexistente, PEM inválido, sin destino, umbral inválido', async () => {
    expect(await probe(['--file', join(dir, 'no-existe.pem')])).toMatchObject({ status: 'ERROR' });
    expect(await probe(['--file', join(dir, 'long.key')])).toMatchObject({ status: 'ERROR' });
    expect(await probe([])).toMatchObject({ status: 'ERROR' });
    expect(await probe(['--file', longCert, '--threshold-days', '0'])).toMatchObject({ status: 'ERROR' });
  });

  it('CLI: códigos de salida 0/1/2 y el certificado no se modifica', () => {
    const script = join(REPO_ROOT, 'infra/tls/cert-expiry-probe.mjs');
    const before = statSync(shortCert).mtimeMs;
    const run = (args: string[]) => spawnSync('node', [script, ...args], { encoding: 'utf8' });
    expect(run(['--file', longCert]).status).toBe(0);
    const alert = run(['--file', shortCert]);
    expect(alert.status).toBe(1);
    expect(JSON.parse(alert.stdout).status).toBe('ALERT');
    expect(run(['--file', join(dir, 'no-existe.pem')]).status).toBe(2);
    expect(statSync(shortCert).mtimeMs).toBe(before);
  });

  it('es read-only y documenta el handoff al Gate Admin', () => {
    const source = readRepoFile('infra/tls/cert-expiry-probe.mjs');
    expect(source).not.toMatch(/writeFile|unlink|rmSync|certbot|renew|execSync|spawn/);
    expect(readRepoFile('infra/tls/README.md')).toContain('09_GATE_ADMIN_HANDOFF_OWASP_2025.md');
  });
});
