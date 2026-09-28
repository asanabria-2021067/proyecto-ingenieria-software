import { describe, expect, it } from 'vitest';
import {
  CSP_VIOLATION_ALLOWLIST,
  allowlistFindings,
  normalizeViolation,
  unexpectedViolations,
} from '../e2e/support/csp-violations';

/**
 * G06-C09 · OWASP25-C039. Normalización sin datos sensibles y regla de fallo
 * de la captura CSP del E2E: solo pasan las violaciones con excepción
 * explícita y razonada.
 */

describe('G06-C09: captura de violaciones CSP (lógica)', () => {
  it('normaliza a origen/tipo y ruta, sin query, fragmento ni rutas completas', () => {
    expect(
      normalizeViolation({
        directive: 'img-src',
        disposition: 'report',
        blocked: 'https://cdn.example.test/a/b.png?token=abc#x',
        page: 'http://localhost:3000/dashboard/proyectos/7?email=a@uvg.edu.gt#top',
      }),
    ).toEqual({ directive: 'img-src', disposition: 'report', blocked: 'https://cdn.example.test', page: '/dashboard/proyectos/7' });
    expect(normalizeViolation({ directive: 'script-src-elem', disposition: 'enforce', blocked: 'inline', page: 'x' }).blocked).toBe('inline');
    expect(normalizeViolation({ directive: 'img-src', disposition: 'report', blocked: 'data:image/png;base64,AAAA', page: 'x' }).blocked).toBe('data');
  });

  it('fixture: una violación inesperada hace fallar; una permitida con razón no', () => {
    const artificial = { directive: 'img-src', disposition: 'report', blocked: 'https://evil.example', page: '/' };
    expect(unexpectedViolations([artificial])).toEqual([artificial]);
    const allowlist = [{ directive: 'img-src', blocked: 'https://evil.example', reason: 'fixture: origen documentado en la prueba unitaria' }];
    expect(unexpectedViolations([artificial], allowlist)).toEqual([]);
  });

  it('la allowlist real no silencia nada de forma genérica ni sin razón', () => {
    expect(allowlistFindings(CSP_VIOLATION_ALLOWLIST)).toEqual([]);
    expect(allowlistFindings([{ directive: '*', blocked: '*', reason: 'x' }])).toEqual(['*:*:sin-razon', '*:*:generica']);
  });
});
