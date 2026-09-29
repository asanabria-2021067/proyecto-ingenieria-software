import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildEnvOptions } from '../src/config/env.options';
import { validateEnvironment } from '../src/config/environment.validation';
import {
  JWT_SECRET_MIN_LENGTH,
  KNOWN_INSECURE_JWT_SECRETS,
  assertJwtSecret,
  getJwtSecret,
  getJwtSecretFromConfig,
} from '../src/config/jwt-secret';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * G01-C02 · OWASP25-C019. JWT_SECRET se lee por un único proveedor que falla
 * cerrado: ausente, vacío, valor por defecto conocido o menos de 32
 * caracteres impiden arrancar. Ningún mensaje ni log expone el valor ni su
 * longitud. Todos los valores son sintéticos.
 */

const REQUIRED = 'JWT_SECRET environment variable is required';
const KNOWN_DEFAULT = 'JWT_SECRET must not use a known default value';
const TOO_SHORT = `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters long`;

const EXACT_MIN = 's'.repeat(JWT_SECRET_MIN_LENGTH);
const ONE_SHORT = 's'.repeat(JWT_SECRET_MIN_LENGTH - 1);

function baseEnvironment(jwtSecret?: string): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:3000' };
  if (jwtSecret !== undefined) {
    env.JWT_SECRET = jwtSecret;
  }
  return env;
}

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('se esperaba un error');
}

describe('G01-C02: proveedor único y fail-closed de JWT_SECRET', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('acepta un secreto de exactamente la longitud mínima y lo devuelve sin alterarlo', () => {
    expect(assertJwtSecret(EXACT_MIN)).toBe(EXACT_MIN);
    expect(assertJwtSecret(SYNTHETIC_JWT_SECRET)).toBe(SYNTHETIC_JWT_SECRET);
  });

  it.each([
    ['ausente', undefined, REQUIRED],
    ['vacío', '', REQUIRED],
    ['solo espacios', '    ', REQUIRED],
    ['no string', 12345, REQUIRED],
    ['antiguo fallback del código', 'dev-secret-change-me', KNOWN_DEFAULT],
    ['placeholder del template', 'super-secret-key-change-in-production', KNOWN_DEFAULT],
    ['un carácter por debajo del mínimo', ONE_SHORT, TOO_SHORT],
  ])('rechaza de forma determinista un secreto %s', (_caso, value, message) => {
    expect(() => assertJwtSecret(value)).toThrow(message);
  });

  it('los valores por defecto conocidos se rechazan aunque vengan con espacios', () => {
    for (const insecure of KNOWN_INSECURE_JWT_SECRETS) {
      expect(() => assertJwtSecret(`  ${insecure}  `)).toThrow(KNOWN_DEFAULT);
    }
  });

  it('los mensajes de error no exponen el valor ni su longitud exacta', () => {
    const shortSecret = 'x'.repeat(20);
    const message = errorOf(() => assertJwtSecret(shortSecret)).message;
    expect(message).not.toContain(shortSecret);
    expect(message).not.toContain(String(shortSecret.length));

    const insecureMessage = errorOf(() => assertJwtSecret('dev-secret-change-me')).message;
    expect(insecureMessage).not.toContain('dev-secret-change-me');
  });

  it('validateEnvironment (arranque) pasa con un secreto válido y conserva el valor crudo', () => {
    const validated = validateEnvironment(baseEnvironment(SYNTHETIC_JWT_SECRET));
    expect(validated.JWT_SECRET).toBe(SYNTHETIC_JWT_SECRET);
  });

  it.each([
    ['ausente', undefined, REQUIRED],
    ['corto', ONE_SHORT, TOO_SHORT],
    ['dev-secret-change-me', 'dev-secret-change-me', KNOWN_DEFAULT],
  ])('validateEnvironment (arranque) falla con un secreto %s', (_caso, value, message) => {
    expect(() => validateEnvironment(baseEnvironment(value))).toThrow(message);
  });

  it('ningún log emitido durante la validación contiene el secreto', () => {
    const logged: unknown[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((method) =>
      vi.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      }),
    );
    try {
      validateEnvironment(baseEnvironment(SYNTHETIC_JWT_SECRET));
      expect(() => validateEnvironment(baseEnvironment(ONE_SHORT))).toThrow();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    const text = JSON.stringify(logged);
    expect(text).not.toContain(SYNTHETIC_JWT_SECRET);
    expect(text).not.toContain(ONE_SHORT);
  });

  it('ConfigModule.forRoot con la foundation real pasa con secreto válido y rechaza el arranque sin JWT_SECRET', async () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.JWT_SECRET = SYNTHETIC_JWT_SECRET;
    await expect(ConfigModule.forRoot(buildEnvOptions({ nodeEnv: 'test' }))).resolves.toBeDefined();

    delete process.env.JWT_SECRET;
    await expect(ConfigModule.forRoot(buildEnvOptions({ nodeEnv: 'test' }))).rejects.toThrow(REQUIRED);
  });

  it('getJwtSecret lee process.env a través del proveedor y falla cerrado', () => {
    process.env.JWT_SECRET = SYNTHETIC_JWT_SECRET;
    expect(getJwtSecret()).toBe(SYNTHETIC_JWT_SECRET);

    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(REQUIRED);

    process.env.JWT_SECRET = 'dev-secret-change-me';
    expect(() => getJwtSecret()).toThrow(KNOWN_DEFAULT);
  });

  it('getJwtSecretFromConfig lee del ConfigService validado y falla cerrado', () => {
    // ConfigService consulta process.env como respaldo: se aísla para probar solo la config.
    delete process.env.JWT_SECRET;
    expect(getJwtSecretFromConfig(new ConfigService({ JWT_SECRET: SYNTHETIC_JWT_SECRET }))).toBe(
      SYNTHETIC_JWT_SECRET,
    );
    expect(() => getJwtSecretFromConfig(new ConfigService({}))).toThrow(REQUIRED);
    expect(() => getJwtSecretFromConfig(new ConfigService({ JWT_SECRET: ONE_SHORT }))).toThrow(TOO_SHORT);
  });
});
