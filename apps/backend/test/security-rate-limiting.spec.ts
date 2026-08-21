import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-127 (IESUC-285). Mismo estilo que labels.controller.spec.ts /
 * tasks-assign.controller.spec.ts: se lee el código fuente real y se
 * verifican los patrones de configuración, en vez de levantar la app Nest
 * completa (los specs de integración con Nest real viven aparte y
 * requieren Postgres).
 */

const APP_MODULE_SOURCE = readFileSync(join(__dirname, '../src/app.module.ts'), 'utf-8');
const MAIN_SOURCE = readFileSync(join(__dirname, '../src/main.ts'), 'utf-8');
const AUTH_CONTROLLER_SOURCE = readFileSync(
  join(__dirname, '../src/auth/auth.controller.ts'),
  'utf-8',
);

describe('Rate limiting global (ThrottlerGuard)', () => {
  it('ThrottlerGuard está registrado como APP_GUARD, no solo el módulo importado', () => {
    expect(APP_MODULE_SOURCE).toMatch(/ThrottlerModule\.forRoot/);
    expect(APP_MODULE_SOURCE).toMatch(/provide:\s*APP_GUARD/);
    expect(APP_MODULE_SOURCE).toMatch(/useClass:\s*ThrottlerGuard/);
  });

  it('declara ttl y limit con valores razonables para cada bucket', () => {
    const buckets = [...APP_MODULE_SOURCE.matchAll(/ttl:\s*(\d+),\s*limit:\s*(\d+)/g)];
    expect(buckets.length).toBeGreaterThan(0);
    for (const [, ttl, limit] of buckets) {
      expect(Number(ttl)).toBeGreaterThan(0);
      expect(Number(limit)).toBeGreaterThan(0);
      // Un límite de miles de requests por segundo no protege nada.
      expect(Number(limit)).toBeLessThanOrEqual(1000);
    }
  });
});

describe('AuthController — sin bypass de throttling', () => {
  it('no usa @SkipThrottle en ningún método ni a nivel de controlador', () => {
    expect(AUTH_CONTROLLER_SOURCE).not.toMatch(/@SkipThrottle/);
  });

  it('login tiene un @Throttle dedicado y estricto (≤5 intentos por minuto)', () => {
    const match = AUTH_CONTROLLER_SOURCE.match(
      /@Throttle\(\{[\s\S]*?limit:\s*(\d+)[\s\S]*?ttl:\s*(\d+)[\s\S]*?\}\)\s*\n\s*@Post\('login'\)/,
    );
    expect(match).not.toBeNull();
    if (!match) throw new Error('login sin @Throttle');
    const [, limit, ttl] = match;
    expect(Number(limit)).toBeLessThanOrEqual(5);
    expect(Number(ttl)).toBeLessThanOrEqual(60_000);
  });

  it('forgot-password (recuperación de contraseña) tiene un @Throttle dedicado y estricto', () => {
    const match = AUTH_CONTROLLER_SOURCE.match(
      /@Throttle\(\{[\s\S]*?limit:\s*(\d+)[\s\S]*?ttl:\s*(\d+)[\s\S]*?\}\)\s*\n\s*@Post\('forgot-password'\)/,
    );
    expect(match).not.toBeNull();
    if (!match) throw new Error('forgot-password sin @Throttle');
    const [, limit, ttl] = match;
    expect(Number(limit)).toBeLessThanOrEqual(5);
    expect(Number(ttl)).toBeLessThanOrEqual(60_000);
  });
});

describe('Cabeceras y validación global (main.ts)', () => {
  it('Helmet está activo', () => {
    expect(MAIN_SOURCE).toMatch(/app\.use\(helmet\(\)\)/);
  });

  it('ValidationPipe global usa whitelist y forbidNonWhitelisted', () => {
    const match = MAIN_SOURCE.match(/new ValidationPipe\(\{([\s\S]*?)\}\)/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('ValidationPipe no configurado');
    expect(match[1]).toMatch(/whitelist:\s*true/);
    expect(match[1]).toMatch(/forbidNonWhitelisted:\s*true/);
  });

  it('CORS no permite cualquier origen ("*")', () => {
    const match = MAIN_SOURCE.match(/app\.enableCors\(\{([\s\S]*?)\}\)/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('CORS no configurado');
    expect(match[1]).not.toMatch(/origin:\s*['"]\*['"]/);
    expect(match[1]).not.toMatch(/origin:\s*true\b/);
  });
});
