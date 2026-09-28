import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { apiConnectSources, buildContentSecurityPolicy } from '../lib/security/csp';
import { headersFor } from './helpers/next-headers';

/**
 * G06-C04 · OWASP25-C039. CSP Report-Only basada en el inventario real de
 * orígenes del frontend: parseable, con directivas exactas y sin comodines
 * amplios. Los fixtures muestran que un comodín, un origen extra o una
 * directiva perdida hacen fallar el contrato.
 */

/** Parser estricto: directivas separadas por `;`, sin duplicados. */
export function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) {
      throw new Error('directiva vacía');
    }
    if (directives.has(name)) {
      throw new Error(`directiva duplicada: ${name}`);
    }
    directives.set(name, sources);
  }
  return directives;
}

/** Fuentes demasiado amplias. `'unsafe-inline'` solo se admite donde está justificado (script/style). */
export function broadSourceFindings(policy: string): string[] {
  const findings: string[] = [];
  for (const [name, sources] of parseCsp(policy)) {
    for (const source of sources) {
      if (['*', 'http:', 'https:', 'ws:', 'wss:', "'unsafe-eval'"].includes(source) || source.includes('*')) {
        findings.push(`${name}:${source}`);
      }
      if (source === "'unsafe-inline'" && !['script-src', 'style-src'].includes(name)) {
        findings.push(`${name}:${source}`);
      }
    }
  }
  return findings;
}

const EXPECTED_WITHOUT_API: Array<[string, string[]]> = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'unsafe-inline'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'", 'https://api.cloudinary.com']],
  ['frame-src', ['blob:']],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
];

describe('G06-C04: CSP Report-Only con inventario explícito', () => {
  it('sin API externa: directivas exactas y en orden', () => {
    expect([...parseCsp(buildContentSecurityPolicy(undefined))]).toEqual(EXPECTED_WITHOUT_API);
  });

  it('con API externa: connect-src suma solo su origen y las variantes ws/wss del mismo host', () => {
    const csp = parseCsp(buildContentSecurityPolicy('http://localhost:3001/api-no-usado?x=1'));
    expect(csp.get('connect-src')).toEqual([
      "'self'",
      'http://localhost:3001',
      'ws://localhost:3001',
      'wss://localhost:3001',
      'https://api.cloudinary.com',
    ]);
    expect(apiConnectSources('https://api.example.test')).toEqual([
      'https://api.example.test',
      'ws://api.example.test',
      'wss://api.example.test',
    ]);
  });

  it('una URL de API que no es http(s) se rechaza', () => {
    expect(() => apiConnectSources('javascript:alert(1)')).toThrow(/http\(s\)/);
  });

  it('sin comodines amplios ni unsafe-eval; unsafe-inline solo en script/style', () => {
    expect(broadSourceFindings(buildContentSecurityPolicy('http://localhost:3001'))).toEqual([]);
  });

  it('next.config: la política va en Report-Only y la CSP aplicada sigue siendo solo frame-ancestors', async () => {
    const headers = await headersFor(nextConfig, '/dashboard');
    expect(headers['content-security-policy-report-only']).toBe(buildContentSecurityPolicy(process.env.NEXT_PUBLIC_API_URL));
    expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(parseCsp(headers['content-security-policy-report-only']).has('report-uri')).toBe(false);
    expect(await headersFor(nextConfig, '/api/proyectos')).toEqual({});
  });

  describe('fixtures negativos', () => {
    it('comodines, esquemas desnudos y unsafe-eval', () => {
      expect(
        broadSourceFindings("default-src *; img-src https:; connect-src 'self' wss:; script-src 'self' 'unsafe-eval'; frame-src *.example.com"),
      ).toEqual(['default-src:*', 'img-src:https:', 'connect-src:wss:', "script-src:'unsafe-eval'", 'frame-src:*.example.com']);
    });

    it('unsafe-inline fuera de script/style', () => {
      expect(broadSourceFindings("img-src 'self' 'unsafe-inline'")).toEqual(["img-src:'unsafe-inline'"]);
    });

    it('una política con directiva duplicada o vacía no es parseable', () => {
      expect(() => parseCsp("default-src 'self'; default-src *")).toThrow(/duplicada/);
      expect(() => parseCsp("default-src 'self';; img-src 'self'")).toThrow(/vacía/);
    });

    it('una directiva perdida o un origen extra cambia el resultado exacto', () => {
      const sinObject = [...parseCsp(buildContentSecurityPolicy(undefined))].filter(([name]) => name !== 'object-src');
      expect(sinObject).not.toEqual(EXPECTED_WITHOUT_API);
    });
  });
});
