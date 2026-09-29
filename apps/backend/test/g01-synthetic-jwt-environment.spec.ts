import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * G01-C01 · OWASP25-C019. Las suites y los jobs de CI que arrancan Nest deben
 * proveer un JWT_SECRET sintético de al menos 32 caracteres, de modo que
 * ninguno dependa del fallback predecible del código antes de que la carga
 * del secreto pase a ser fail-closed.
 */

const MIN_LENGTH = 32;
const PREDICTABLE_DEFAULTS = ['dev-secret-change-me', 'super-secret-key-change-in-production'];
const CI_WORKFLOW = readFileSync(join(__dirname, '../../../.github/workflows/ci.yml'), 'utf8');

function ciJwtSecrets(): string[] {
  return [...CI_WORKFLOW.matchAll(/^\s*JWT_SECRET:\s*(\S+)\s*$/gm)].map((match) => match[1]);
}

describe('G01-C01: JWT_SECRET sintético en tests y CI', () => {
  it('el setupFile de Vitest fija el secreto sintético antes de cada spec', () => {
    expect(process.env.JWT_SECRET).toBe(SYNTHETIC_JWT_SECRET);
    expect(SYNTHETIC_JWT_SECRET.length).toBeGreaterThanOrEqual(MIN_LENGTH);
    expect(PREDICTABLE_DEFAULTS).not.toContain(SYNTHETIC_JWT_SECRET);
  });

  it('ci.yml define JWT_SECRET para el job backend (nivel workflow) y para el E2E', () => {
    const secrets = ciJwtSecrets();
    // Uno a nivel de workflow (lo heredan backend y frontend) y el override del E2E.
    expect(secrets.length).toBeGreaterThanOrEqual(2);
    expect(CI_WORKFLOW).toMatch(/^env:\n(?:  .*\n|\n)*?  JWT_SECRET: \S+$/m);
  });

  it('ningún JWT_SECRET de ci.yml es corto, predecible ni una referencia a un secreto real', () => {
    for (const value of ciJwtSecrets()) {
      expect(value.length, 'JWT_SECRET de CI demasiado corto').toBeGreaterThanOrEqual(MIN_LENGTH);
      expect(PREDICTABLE_DEFAULTS).not.toContain(value);
      expect(value).not.toContain('secrets.');
    }
  });
});
