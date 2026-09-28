import type { NextConfig } from 'next';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { headerContractFindings, headersFor } from './helpers/next-headers';

/**
 * G06-C01 · OWASP25-C039. Harness del contrato de cabeceras del frontend:
 * evalúa `headers()` de next.config con la semántica real de rutas de Next y
 * comprueba presencia, ausencia, valor exacto y ámbito. Los fixtures muestran
 * que una cabecera faltante, cambiada o sobrante hace fallar el contrato.
 */

const fixture: NextConfig = {
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/dashboard/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

const contract = {
  required: { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' },
  absent: ['X-Powered-By'],
};

describe('G06-C01: harness del contrato de cabeceras del frontend', () => {
  it('evalúa las reglas con la semántica de rutas de Next (ámbito)', async () => {
    expect(await headersFor(fixture, '/')).toEqual({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
    expect(await headersFor(fixture, '/login')).toEqual({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
    // `/api/...` queda fuera del ámbito del source.
    expect(await headersFor(fixture, '/api/auth/login')).toEqual({});
  });

  it('una regla posterior que coincide sobrescribe la misma cabecera (orden de Next)', async () => {
    expect((await headersFor(fixture, '/dashboard/proyectos'))['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('una configuración que cumple no produce hallazgos', async () => {
    expect(headerContractFindings(await headersFor(fixture, '/login'), contract)).toEqual([]);
  });

  describe('fixtures negativos', () => {
    it('falta una cabecera requerida', async () => {
      const sinNosniff: NextConfig = {
        async headers() {
          return [{ source: '/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }];
        },
      };
      expect(headerContractFindings(await headersFor(sinNosniff, '/'), contract)).toEqual(['falta X-Content-Type-Options']);
    });

    it('valor cambiado y cabecera prohibida presente', async () => {
      const alterada: NextConfig = {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { key: 'X-Powered-By', value: 'Next.js' },
              ],
            },
          ];
        },
      };
      expect(headerContractFindings(await headersFor(alterada, '/'), contract)).toEqual([
        'X-Frame-Options="SAMEORIGIN" (esperado "DENY")',
        'sobra X-Powered-By',
      ]);
    });

    it('fuera del ámbito del source la ruta no recibe nada y el contrato falla', async () => {
      expect(headerContractFindings(await headersFor(fixture, '/api/x'), contract)).toEqual([
        'falta X-Content-Type-Options',
        'falta X-Frame-Options',
      ]);
    });
  });

});

/** G06-C02: cabeceras base exactas de las páginas del frontend. */
const BASELINE_HEADER_CONTRACT = {
  required: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy': "frame-ancestors 'none'",
  },
};

describe('G06-C02: cabeceras base de seguridad en next.config', () => {
  it.each(['/', '/login', '/registro', '/dashboard', '/dashboard/proyectos/12', '/_next/static/chunks/app.js'])(
    '%s recibe exactamente las cabeceras base',
    async (pathname) => {
      expect(headerContractFindings(await headersFor(nextConfig, pathname), BASELINE_HEADER_CONTRACT)).toEqual([]);
    },
  );

  it.each(['/api', '/api/proyectos', '/api/auth/login'])('%s (proxy hacia el backend) queda fuera: sus cabeceras son de Helmet', async (pathname) => {
    expect(await headersFor(nextConfig, pathname)).toEqual({});
  });

  it('fixture negativo: sin la CSP de frame-ancestors el contrato falla', async () => {
    const sinFrameAncestors: NextConfig = {
      async headers() {
        const rules = (await nextConfig.headers?.()) ?? [];
        return rules.map((rule) => ({
          ...rule,
          headers: rule.headers.filter((header) => header.key !== 'Content-Security-Policy'),
        }));
      },
    };
    expect(headerContractFindings(await headersFor(sinFrameAncestors, '/'), BASELINE_HEADER_CONTRACT)).toEqual([
      'falta Content-Security-Policy',
    ]);
  });
});

describe('G06-C03: sin X-Powered-By', () => {
  it('next.config desactiva la cabecera del framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('ninguna regla de headers() la reintroduce en páginas', async () => {
    for (const pathname of ['/', '/login', '/dashboard']) {
      expect(headerContractFindings(await headersFor(nextConfig, pathname), { absent: ['X-Powered-By'] })).toEqual([]);
    }
  });

  it('fixture negativo: una regla que la agrega hace fallar el contrato', async () => {
    const conPoweredBy: NextConfig = {
      async headers() {
        return [{ source: '/:path*', headers: [{ key: 'X-Powered-By', value: 'Next.js' }] }];
      },
    };
    expect(headerContractFindings(await headersFor(conPoweredBy, '/'), { absent: ['X-Powered-By'] })).toEqual([
      'sobra X-Powered-By',
    ]);
  });
});
