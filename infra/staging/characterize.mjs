#!/usr/bin/env node
/**
 * Caracterizacion del comportamiento ACTUAL de produccion sobre el arnes
 * efimero (G02-C17). Fija la linea base que los gates G04/G06/G07 cambiaran a
 * proposito (cada cambio debe actualizar estas expectativas en su commit).
 *
 * Solo acepta hosts locales: el arnes nunca apunta a produccion.
 * Uso: HARNESS_HTTP_PORT=8080 HARNESS_HTTPS_PORT=8443 node infra/staging/characterize.mjs
 */
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
    id: 'HARN-04',
    title: '/ por HTTPS sin cabeceras de seguridad del backend',
    request: { path: '/', secure: true, headers: { Accept: 'text/html' } },
    verify: (r) => [
      r.status < 500 || `status ${r.status}`,
      r.headers['strict-transport-security'] === undefined || 'HSTS en /',
      r.headers['content-security-policy'] === undefined || 'CSP en /',
      r.headers['x-frame-options'] === undefined || 'X-Frame-Options en /',
    ],
  },
  {
    id: 'HARN-05',
    title: 'HTTP plano sigue sirviendo /api sin redireccion (sin H4)',
    request: { path: '/api', secure: false, headers: { Accept: 'application/json' } },
    verify: (r) => [r.status === 200 || `status ${r.status} != 200`],
  },
];

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
  process.exitCode = results.every((result) => result.failures.length === 0) ? 0 : 1;
}
