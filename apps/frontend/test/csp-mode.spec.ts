import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContentSecurityPolicy, cspResponseHeaders, parseCspMode } from '../lib/security/csp';
import { headersFor } from './helpers/next-headers';

/**
 * G06-C05 · OWASP25-C039. CSP_MODE (build-time): sin variable → report-only;
 * `enforce` aplica la política completa; un valor inválido hace fallar la
 * carga de next.config (y por tanto el build).
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function configWith(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) {
    vi.stubEnv('CSP_MODE', '');
  } else {
    vi.stubEnv('CSP_MODE', mode);
  }
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
  return (await import('../next.config')).default;
}

describe('G06-C05: CSP_MODE', () => {
  it.each<[string | undefined, string]>([
    [undefined, 'report-only'],
    ['', 'report-only'],
    ['  ', 'report-only'],
    ['report-only', 'report-only'],
    ['enforce', 'enforce'],
  ])('parseCspMode(%j) → %s', (value, expected) => {
    expect(parseCspMode(value)).toBe(expected);
  });

  it.each(['Enforce', 'report_only', 'true', 'off', 'enforce;'])('rechaza %j', (value) => {
    expect(() => parseCspMode(value)).toThrow(/CSP_MODE/);
  });

  it('report-only: frame-ancestors aplicado y la política completa en Report-Only', () => {
    expect(cspResponseHeaders('report-only', undefined)).toEqual([
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'Content-Security-Policy-Report-Only', value: buildContentSecurityPolicy(undefined) },
    ]);
  });

  it('enforce: la política completa se aplica (incluye frame-ancestors) y no hay Report-Only', () => {
    const headers = cspResponseHeaders('enforce', undefined);
    expect(headers).toEqual([{ key: 'Content-Security-Policy', value: buildContentSecurityPolicy(undefined) }]);
    expect(headers[0].value).toContain("frame-ancestors 'none'");
  });

  it('next.config sin CSP_MODE → report-only', async () => {
    const headers = await headersFor(await configWith(undefined), '/');
    expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(headers['content-security-policy-report-only']).toBe(buildContentSecurityPolicy('http://localhost:3001'));
  });

  it('next.config con CSP_MODE=enforce → Content-Security-Policy completa', async () => {
    const headers = await headersFor(await configWith('enforce'), '/login');
    expect(headers['content-security-policy']).toBe(buildContentSecurityPolicy('http://localhost:3001'));
    expect(headers['content-security-policy-report-only']).toBeUndefined();
    expect(headers['x-frame-options']).toBe('DENY');
  });

  it('next.config con un CSP_MODE inválido no carga (el build falla)', async () => {
    await expect(configWith('block-all')).rejects.toThrow(/CSP_MODE/);
  });
});
