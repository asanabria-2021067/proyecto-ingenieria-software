#!/usr/bin/env node
/**
 * Caracterizacion del comportamiento ACTUAL de produccion sobre el arnes
 * efimero (G02-C17). Fija la linea base que los gates G04/G06/G07 cambiaran a
 * proposito (cada cambio debe actualizar estas expectativas en su commit).
 *
 * Solo acepta hosts locales: el arnes nunca apunta a produccion.
 * Uso: HARNESS_HTTP_PORT=8080 HARNESS_HTTPS_PORT=8443 node infra/staging/characterize.mjs
 */
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

export const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
export const EXPECTED_HSTS = 'max-age=31536000; includeSubDomains';

export function assertLocalHost(host) {
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`Host no local rechazado: ${host}. El arnes nunca alcanza produccion.`);
  }
}

function request({ host, port, path, secure, headers = {} }) {
  assertLocalHost(host);
  const client = secure ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      { host, port, path, method: 'GET', headers, rejectUnauthorized: false, timeout: 15000 },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout ${path}`)));
    req.on('error', reject);
    req.end();
  });
}

/** Expectativas de la linea base productiva (VM0.1/VM1). */
export const CHECKS = [
  {
    id: 'HARN-01',
    title: '/api por HTTPS responde con el set de Helmet y el HSTS actual',
    request: { path: '/api', secure: true, headers: { Accept: 'application/json' } },
    verify: (r) => [
      r.status === 200 || `status ${r.status} != 200`,
      r.headers['strict-transport-security'] === EXPECTED_HSTS || `HSTS=${r.headers['strict-transport-security']}`,
      r.headers['x-content-type-options'] === 'nosniff' || 'falta x-content-type-options (Helmet)',
      r.headers['x-powered-by'] === undefined || 'x-powered-by presente en /api',
    ],
  },
  {
    id: 'HARN-02',
    title: '/api con Accept text/html devuelve 403 (regla del site)',
    request: { path: '/api', secure: true, headers: { Accept: 'text/html' } },
    verify: (r) => [r.status === 403 || `status ${r.status} != 403`],
  },
  {
    // G04-C11 (P1): antes caía en el frontend (308); ahora llega al backend.
    id: 'HARN-03',
    title: '/socket.io/ via nginx llega al backend (P1): el polling responde 200',
    request: { path: '/socket.io/?EIO=4&transport=polling', secure: true },
    verify: (r) => [r.status === 200 || `status ${r.status} != 200`],
  },
  {
    // G06-C02: antes / no traía ninguna cabecera de seguridad; ahora trae las
    // cabeceras base del frontend. HSTS sigue siendo solo del backend (/api).
    id: 'HARN-04',
    title: '/ por HTTPS con las cabeceras base del frontend (G06) y sin HSTS',
    request: { path: '/', secure: true, headers: { Accept: 'text/html' } },
    verify: (r) => [
      r.status < 500 || `status ${r.status}`,
      r.headers['strict-transport-security'] === undefined || 'HSTS en /',
      r.headers['x-frame-options'] === 'DENY' || `X-Frame-Options=${r.headers['x-frame-options']}`,
      r.headers['x-content-type-options'] === 'nosniff' || 'falta nosniff en /',
      r.headers['content-security-policy'] === "frame-ancestors 'none'" || `CSP=${r.headers['content-security-policy']}`,
    ],
  },
  {
    id: 'HARN-05',
    title: 'HTTP plano sigue sirviendo /api sin redireccion (sin H4)',
    request: { path: '/api', secure: false, headers: { Accept: 'application/json' } },
    verify: (r) => [r.status === 200 || `status ${r.status} != 200`],
  },
];

/**
 * T13 (G04-C12 · P1): Socket.IO por nginx. El polling debe llegar al backend
 * (200, paquete OPEN de Engine.IO con `sid`) y ese mismo `sid` debe poder
 * pasar a WebSocket (101). Sin la ruta /socket.io/ ambas fallan (el frontend
 * responde 308), que es exactamente lo que prueba el fixture negativo.
 */
export const SOCKET_POLLING_PATH = '/socket.io/?EIO=4&transport=polling';

export function verifyPolling(response) {
  const sid = /^0\{.*"sid":"([^"]+)"/.exec(response.body ?? '')?.[1];
  return {
    sid: sid ?? null,
    failures: [
      response.status === 200 || `status ${response.status} != 200`,
      sid !== undefined || 'sin paquete OPEN con sid (no llegó a Engine.IO)',
    ].filter((outcome) => outcome !== true),
  };
}

export function verifyUpgrade(status) {
  return [status === 101 || `upgrade ${status} != 101`].filter((outcome) => outcome !== true);
}

function fetchBody({ host, port, path }) {
  assertLocalHost(host);
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port, path, rejectUnauthorized: false, timeout: 15000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${path}`)));
    req.on('error', reject);
    req.end();
  });
}

function upgradeStatus({ host, port, path }) {
  assertLocalHost(host);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host,
      port,
      path,
      rejectUnauthorized: false,
      timeout: 15000,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${path}`)));
    req.on('error', reject);
    req.end();
  });
}

export async function characterizeSocket({ host = '127.0.0.1', httpsPort }) {
  const polling = verifyPolling(await fetchBody({ host, port: httpsPort, path: SOCKET_POLLING_PATH }));
  const results = [{ id: 'T13-01', title: 'polling Socket.IO via nginx: 200 con sid', failures: polling.failures }];
  const upgrade = polling.sid
    ? verifyUpgrade(
        await upgradeStatus({ host, port: httpsPort, path: `/socket.io/?EIO=4&transport=websocket&sid=${encodeURIComponent(polling.sid)}` }),
      )
    : ['sin sid del polling: no se puede intentar el upgrade'];
  results.push({ id: 'T13-02', title: 'upgrade WebSocket via nginx con el sid del polling: 101', failures: upgrade });
  return results;
}

/**
 * T16 (G04-C13 · OWASP25-C021): con TRUST_PROXY_HOPS=1 detrás del nginx del
 * arnés, un cliente que envía un X-Forwarded-For falso distinto en cada
 * intento NO elige su cubo de rate limiting: nginx agrega la dirección real al
 * final y Express solo confía en ese último salto. Login permite 5 intentos
 * por minuto; el sexto debe recibir 429 aunque cada uno "venga" de otra IP.
 * Solo se reportan códigos HTTP, nunca direcciones.
 */
export const SPOOF_LOGIN_LIMIT = 5;

export function verifySpoofResistance(statuses) {
  const index = statuses.indexOf(429);
  return [
    index === SPOOF_LOGIN_LIMIT || `429 esperado en el intento ${SPOOF_LOGIN_LIMIT + 1}, obtenido ${index === -1 ? 'nunca' : `en el ${index + 1}`}`,
  ].filter((outcome) => outcome !== true);
}

function postLogin({ host, port, index }) {
  assertLocalHost(host);
  const body = JSON.stringify({ correo: `t16-${index}@uvg.edu.gt`, contrasena: 'Intento-T16' });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        port,
        path: '/api/auth/login',
        method: 'POST',
        rejectUnauthorized: false,
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          // Direcciones de documentación (RFC 5737): nunca reales.
          'X-Forwarded-For': `203.0.113.${index + 1}`,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout login')));
    req.on('error', reject);
    req.end(body);
  });
}

export async function characterizeSpoofing({ host = '127.0.0.1', httpsPort }) {
  const statuses = [];
  for (let index = 0; index <= SPOOF_LOGIN_LIMIT; index += 1) {
    statuses.push(await postLogin({ host, port: httpsPort, index }));
  }
  return [{ id: 'T16-01', title: `XFF falso rotativo no evade el limite de login (${statuses.join(',')})`, failures: verifySpoofResistance(statuses) }];
}

export async function characterize({ host = '127.0.0.1', httpPort, httpsPort }) {
  const results = [];
  for (const check of CHECKS) {
    const port = check.request.secure ? httpsPort : httpPort;
    const response = await request({ host, port, ...check.request });
    const failures = check.verify(response).filter((outcome) => outcome !== true);
    results.push({ id: check.id, title: check.title, status: response.status, failures });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = await characterize({
    host: process.env.HARNESS_HOST ?? '127.0.0.1',
    httpPort: Number(process.env.HARNESS_HTTP_PORT ?? 8080),
    httpsPort: Number(process.env.HARNESS_HTTPS_PORT ?? 8443),
  });
  for (const result of results) {
    console.log(`${result.failures.length === 0 ? 'PASS' : 'FAIL'} ${result.id} (${result.status}) ${result.title}`);
    result.failures.forEach((failure) => console.log(`  - ${failure}`));
  }
  const target = { host: process.env.HARNESS_HOST ?? '127.0.0.1', httpsPort: Number(process.env.HARNESS_HTTPS_PORT ?? 8443) };
  const socket = [...(await characterizeSocket(target)), ...(await characterizeSpoofing(target))];
  for (const result of socket) {
    console.log(`${result.failures.length === 0 ? 'PASS' : 'FAIL'} ${result.id} ${result.title}`);
    result.failures.forEach((failure) => console.log(`  - ${failure}`));
  }
  process.exitCode = [...results, ...socket].every((result) => result.failures.length === 0) ? 0 : 1;
}
