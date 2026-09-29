import express from 'express';
import helmet, { type HelmetOptions } from 'helmet';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { API_HELMET_OPTIONS, HSTS_MAX_AGE_SECONDS } from '../src/config/security-headers';
import { readRepoFile } from './helpers/workflow-yaml';

/**
 * G06-C06 · NBD-1 + C008 (T21 unit). La API emite exactamente
 * `Strict-Transport-Security: max-age=31536000; includeSubDomains`, sin
 * preload, y el resto de cabeceras de Helmet (CSP de la API incluida) queda
 * idéntico a los defaults que ya se emitían.
 */

export const EXPECTED_HSTS = 'max-age=31536000; includeSubDomains';

/** Hallazgos sobre una cabecera HSTS; vacío = contrato cumplido. */
export function hstsFindings(value: string | null | undefined): string[] {
  if (!value) {
    return ['falta Strict-Transport-Security'];
  }
  const findings: string[] = [];
  if (/preload/i.test(value)) {
    findings.push('preload');
  }
  if (value !== EXPECTED_HSTS) {
    findings.push(`valor=${value}`);
  }
  return findings;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function headersWith(options?: HelmetOptions): Promise<Record<string, string>> {
  const app = express();
  app.use(options ? helmet(options) : helmet());
  app.get('/api', (_req, res) => res.json({ ok: true }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (!['date', 'etag', 'content-length', 'connection', 'keep-alive'].includes(key)) {
      headers[key] = value;
    }
  });
  return headers;
}

describe('G06-C06: HSTS de la API fijado explícitamente', () => {
  it('opciones exactas: un año, includeSubDomains, sin preload', () => {
    expect(HSTS_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(API_HELMET_OPTIONS).toEqual({
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
    });
  });

  it('la respuesta real lleva exactamente el HSTS contractual', async () => {
    expect(hstsFindings((await headersWith(API_HELMET_OPTIONS))['strict-transport-security'])).toEqual([]);
  });

  it('sin cambio de comportamiento: todas las cabeceras (CSP de la API incluida) son las del Helmet por defecto', async () => {
    expect(await headersWith(API_HELMET_OPTIONS)).toEqual(await headersWith());
  });

  it('main.ts usa estas opciones y conserva el trust proxy de G04 antes de Helmet', () => {
    const main = readRepoFile('apps/backend/src/main.ts');
    expect(main).toContain('app.use(helmet(API_HELMET_OPTIONS));');
    expect(main).not.toContain('app.use(helmet())');
    expect(main.indexOf('applyTrustProxy(app,')).toBeGreaterThan(-1);
    expect(main.indexOf('applyTrustProxy(app,')).toBeLessThan(main.indexOf('app.use(helmet(API_HELMET_OPTIONS))'));
  });

  describe('fixtures negativos', () => {
    it.each<[string, HelmetOptions, string[]]>([
      ['preload activado', { strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true } }, ['preload', 'valor=max-age=31536000; includeSubDomains; preload']],
      ['max-age=0', { strictTransportSecurity: { maxAge: 0 } }, ['valor=max-age=0; includeSubDomains']],
      ['max-age cambiado', { strictTransportSecurity: { maxAge: 15_552_000 } }, ['valor=max-age=15552000; includeSubDomains']],
      ['sin includeSubDomains', { strictTransportSecurity: { includeSubDomains: false } }, ['valor=max-age=31536000']],
      ['HSTS desactivado', { strictTransportSecurity: false }, ['falta Strict-Transport-Security']],
    ])('%s hace fallar el contrato', async (_caso, options, expected) => {
      expect(hstsFindings((await headersWith(options))['strict-transport-security'])).toEqual(expected);
    });
  });
});
