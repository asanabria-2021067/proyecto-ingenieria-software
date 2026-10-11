import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
// Las mismas funciones que ejecuta run-harness.sh contra nginx con TLS.
import {
  EXPECTED_FRONTEND_HEADERS,
  PENDING_ACCOUNT_MESSAGE,
  characterizeTls,
  verifyAuthCookies,
  verifyPendingAccount,
  verifyFrontendHeaders,
  verifyHsts,
} from '../../../infra/staging/characterize.mjs';

/**
 * G06-C08 · OWASP25-C039/C049 + T17/T18/T21. Lógica de verificación del arnés
 * TLS y sus fixtures negativos: una cabecera ausente o cambiada, HSTS con
 * preload o una cookie sin Secure hacen fallar el arnés.
 */

const REPORT_ONLY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const goodFrontend = { ...EXPECTED_FRONTEND_HEADERS, 'content-security-policy-report-only': REPORT_ONLY };
const goodCookies = [
  'access_token=x; Max-Age=3600; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
  'refresh_token=y; Max-Age=2592000; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
];

describe('G06-C08: T17/T18/T21 en el arnés TLS', () => {
  it('T17: las cabeceras correctas del frontend pasan', () => {
    expect(verifyFrontendHeaders(goodFrontend)).toEqual([]);
  });

  it('T21: el HSTS contractual pasa', () => {
    expect(verifyHsts({ 'strict-transport-security': 'max-age=31536000; includeSubDomains' })).toEqual([]);
  });

  it('T18: cookies con Secure, HttpOnly, SameSite=Lax y Path=/ pasan', () => {
    expect(verifyAuthCookies(goodCookies)).toEqual([]);
  });

  it('T18: registro 201 sin cookies de sesión y login 403 con el mensaje de cuenta pendiente pasan', () => {
    expect(
      verifyPendingAccount({
        registro: { status: 201 },
        login: { status: 403, message: PENDING_ACCOUNT_MESSAGE },
      }),
    ).toEqual([]);
  });

  it('T18: un registro que emite cookies de sesión o un login que no responde 403 fallan', () => {
    expect(
      verifyPendingAccount({
        registro: { status: 201, setCookies: goodCookies },
        login: { status: 403, message: PENDING_ACCOUNT_MESSAGE },
      }),
    ).toEqual(['el registro emitio cookies de sesion: access_token,refresh_token']);
    expect(
      verifyPendingAccount({
        registro: { status: 201 },
        login: { status: 401, message: 'Credenciales invalidas' },
      }),
    ).toEqual(['login status 401 != 403', 'el login no devolvio el mensaje de cuenta pendiente']);
  });

  describe('fixtures negativos', () => {
    it('T17: cabecera ausente, valor cambiado, X-Powered-By o HSTS en el frontend', () => {
      const { 'x-frame-options': _xfo, ...sinXfo } = goodFrontend;
      expect(verifyFrontendHeaders(sinXfo)).toEqual(['x-frame-options=ausente']);
      expect(verifyFrontendHeaders({ ...goodFrontend, 'referrer-policy': 'unsafe-url' })).toEqual(['referrer-policy=unsafe-url']);
      expect(
        verifyFrontendHeaders({ ...goodFrontend, 'x-powered-by': 'Next.js', 'strict-transport-security': 'max-age=1' }),
      ).toEqual(['x-powered-by presente', 'strict-transport-security presente']);
    });

    it('T17: la Report-Only sin una directiva clave', () => {
      expect(
        verifyFrontendHeaders({ ...goodFrontend, 'content-security-policy-report-only': "default-src 'self'; frame-ancestors 'none'" }),
      ).toEqual(["report-only sin object-src 'none'", "report-only sin base-uri 'self'"]);
    });

    it('T21: preload, otro max-age o ausencia', () => {
      expect(verifyHsts({ 'strict-transport-security': 'max-age=31536000; includeSubDomains; preload' })).toEqual([
        'HSTS=max-age=31536000; includeSubDomains; preload',
        'HSTS con preload',
      ]);
      expect(verifyHsts({ 'strict-transport-security': 'max-age=0' })).toEqual(['HSTS=max-age=0']);
      expect(verifyHsts({})).toEqual(['HSTS=ausente']);
    });

    it('T18: cookie sin Secure (COOKIE_SECURE=false), sin HttpOnly o ausente', () => {
      expect(verifyAuthCookies(goodCookies.map((cookie) => cookie.replace('; Secure', '')))).toEqual([
        'access_token sin secure',
        'refresh_token sin secure',
      ]);
      expect(verifyAuthCookies([goodCookies[0].replace('; HttpOnly', '')])).toEqual([
        'access_token sin httponly',
        'falta cookie refresh_token',
      ]);
    });
  });

  it('la sonda TLS rechaza hosts no locales antes de conectar', async () => {
    await expect(characterizeTls({ host: 'example.com', httpsPort: 443, carreraId: '1' })).rejects.toThrow(/Host no local/);
  });

  it('el arnés corre el backend con COOKIE_SECURE=true y siembra una sola carrera sintética', () => {
    expect(readRepoFile('infra/staging/docker-compose.yml')).toMatch(/COOKIE_SECURE: 'true'/);
    const script = readRepoFile('infra/staging/run-harness.sh');
    expect(script).toContain("INSERT INTO carrera (nombre_carrera) VALUES ('Carrera sintetica T18')");
    expect(script.indexOf('HARNESS_T18_CARRERA_ID')).toBeLessThan(script.indexOf('node characterize.mjs'));
  });
});
