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

  it('línea base antes de G06-C02: next.config todavía no declara cabeceras propias', async () => {
    // Estado de partida medido con el harness; G06-C02 convierte esto en el contrato real.
    expect(await headersFor(nextConfig, '/')).toEqual({});
  });
});
