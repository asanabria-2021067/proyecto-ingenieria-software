// K1 — helper reutilizable de autenticación para los escenarios de carga
// (K2/K3). Encapsula el contrato REAL de login del backend (inspeccionado
// en apps/backend/src/auth/{auth.controller.ts,auth.service.ts,cookie.util.ts,
// jwt.strategy.ts,dto/login.dto.ts}), para que un escenario nunca tenga que
// conocer la ruta exacta, la forma del body ni de dónde sale el token:
//
//   ruta:              POST {config.baseUrl}/auth/login
//   body:              { correo, contrasena }  (DTO real: LoginDto)
//   status de éxito:   201 (Nest usa 201 por defecto en @Post() sin @HttpCode)
//   respuesta:         { mensaje: 'Sesión iniciada' } — T-197: el body YA NO
//                      trae accessToken/refreshToken (auth.controller.ts:18-20).
//                      Los tokens viajan como cookies httpOnly Set-Cookie
//                      `access_token` / `refresh_token` (setAuthCookies,
//                      cookie.util.ts), leídas aquí de `res.cookies` (k6
//                      expone las cookies de ESA respuesta ahí, sin depender
//                      del jar automático de VU, que no cruza el límite
//                      setup()->default() de forma fiable).
//   header de sesión:  Authorization: Bearer <accessToken> sigue funcionando:
//                      jwt.strategy.ts intenta primero la cookie `access_token`
//                      y cae a ExtractJwt.fromAuthHeaderAsBearerToken() si no
//                      hay cookie en la request — exactamente el caso de un
//                      escenario k6 que reenvía el token como header manual
//                      en vez de cookie.
//
// Usa exclusivamente APIs oficiales de k6 (k6/http, k6/check) — nunca
// axios/fetch de Node/fs/path/process.env, que k6 no soporta en su runtime.

import http from 'k6/http';
import { check } from 'k6';
import { config, getCredentials } from '../config.js';

const LOGIN_PATH = '/auth/login';
const LOGIN_SUCCESS_STATUS = 201;

/**
 * Autentica contra el backend real y devuelve { accessToken, refreshToken }.
 * Nunca devuelve `undefined` silenciosamente: si el status o la forma de la
 * respuesta no coinciden con el contrato real, lanza un error explícito
 * (sanitizado: nunca incluye la contraseña ni el body completo) para que el
 * escenario falle de inmediato en vez de arrastrar un token vacío.
 *
 * K2.1: acepta opcionalmente credenciales explícitas `{ email, password }`
 * para autenticar una SEGUNDA identidad distinta de K6_USER_EMAIL/
 * K6_USER_PASSWORD (necesario para escenarios de dos actores, p. ej.
 * socket-io.js verificando SPRINT_FINALIZATION_STARTED con un listener
 * distinto del líder que finaliza). Retrocompatible: `login()` sin
 * argumentos se comporta exactamente igual que antes (getCredentials()
 * desde __ENV). Sigue existiendo un único código que hace
 * `POST {baseUrl}/auth/login` — `credentials` solo decide de dónde salen
 * `email`/`password` antes de esa única llamada.
 */
export function login(credentials) {
  const { email, password } = credentials ?? getCredentials();
  if (!email || !password) {
    throw new Error('login() falló: credenciales explícitas incompletas (faltan email/password)');
  }
  const url = `${config.baseUrl}${LOGIN_PATH}`;

  const res = http.post(
    url,
    JSON.stringify({ correo: email, contrasena: password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const statusOk = check(res, {
    'login: status es 201': (r) => r.status === LOGIN_SUCCESS_STATUS,
  });
  if (!statusOk) {
    // Nunca se imprime el body de la respuesta: puede incluir detalles de
    // error del backend que no deben quedar en logs de carga.
    throw new Error(`login() falló contra ${url}: status ${res.status} (se esperaba ${LOGIN_SUCCESS_STATUS})`);
  }

  // T-197: los tokens ya no vienen en el body JSON, sino como cookies
  // httpOnly en la respuesta (`res.cookies`, ver cabecera del archivo).
  const accessTokenCookie = res.cookies && res.cookies.access_token && res.cookies.access_token[0];
  const refreshTokenCookie = res.cookies && res.cookies.refresh_token && res.cookies.refresh_token[0];

  if (!accessTokenCookie || !accessTokenCookie.value) {
    throw new Error(`login() falló contra ${url}: la respuesta no incluye la cookie access_token`);
  }

  return {
    accessToken: accessTokenCookie.value,
    refreshToken: refreshTokenCookie ? refreshTokenCookie.value : undefined,
  };
}

/**
 * Headers autenticados listos para reutilizar en los escenarios de K2, para
 * no repetir `Authorization: Bearer ...` + Content-Type en cada uno.
 */
export function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}
