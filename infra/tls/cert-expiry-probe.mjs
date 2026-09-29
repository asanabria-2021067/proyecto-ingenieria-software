#!/usr/bin/env node
/**
 * Sonda de expiración de certificados TLS (G06-C10 · NBD-1 operacional).
 *
 * READ-ONLY: lee `notAfter` de un certificado y avisa antes de que caduque. El
 * HSTS de la API (max-age de un año, includeSubDomains) obliga a que el
 * certificado nunca expire: con HSTS activo un certificado vencido deja el
 * sitio inaccesible y el navegador no permite saltarse el error.
 *
 *   node infra/tls/cert-expiry-probe.mjs --file <cert.pem> [--threshold-days 21]
 *   node infra/tls/cert-expiry-probe.mjs --host <host> [--port 443] [--threshold-days 21]
 *
 * Estados (y código de salida): OK (0), ALERT si quedan menos de 21 días (1),
 * EXPIRED (1), ERROR si no se pudo leer o interpretar la fecha (2).
 * Nunca modifica, renueva ni instala certificados. Ejecutarla o programarla
 * contra producción es del Gate Admin (09_GATE_ADMIN_HANDOFF_OWASP_2025.md);
 * este repositorio solo la prueba con certificados sintéticos locales.
 */
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

export const DEFAULT_THRESHOLD_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Interpreta `notAfter` (formato de OpenSSL/Node, p. ej. "Dec 25 12:00:00 2026 GMT", o ISO). */
export function parseNotAfter(value) {
  const date = new Date(value);
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(date.getTime())) {
    throw new Error('notAfter ilegible');
  }
  return date;
}

/** Estado de un certificado dado su notAfter; ALERT cuando quedan MENOS de `thresholdDays`. */
export function evaluateExpiry(notAfter, now = new Date(), thresholdDays = DEFAULT_THRESHOLD_DAYS) {
  const remainingMs = notAfter.getTime() - now.getTime();
  const daysLeft = Math.floor(remainingMs / DAY_MS);
  if (remainingMs <= 0) {
    return { status: 'EXPIRED', daysLeft, notAfter: notAfter.toISOString() };
  }
  if (remainingMs < thresholdDays * DAY_MS) {
    return { status: 'ALERT', daysLeft, notAfter: notAfter.toISOString() };
  }
  return { status: 'OK', daysLeft, notAfter: notAfter.toISOString() };
}

export function notAfterFromPem(pem) {
  return parseNotAfter(new X509Certificate(pem).validTo);
}

/** Lee el certificado que presenta un servidor TLS (solo handshake; no envía datos). */
export function notAfterFromHost(host, port = 443, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      try {
        resolve(parseNotAfter(certificate?.valid_to));
      } catch (error) {
        reject(error);
      }
    });
    socket.on('timeout', () => socket.destroy(new Error('timeout TLS')));
    socket.on('error', reject);
  });
}

export const EXIT_CODES = { OK: 0, ALERT: 1, EXPIRED: 1, ERROR: 2 };

export async function probe(args, now = new Date()) {
  const option = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const threshold = Number(option('--threshold-days') ?? DEFAULT_THRESHOLD_DAYS);
  try {
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new Error('--threshold-days debe ser un entero positivo');
    }
    let notAfter;
    if (option('--file')) {
      notAfter = notAfterFromPem(readFileSync(option('--file'), 'utf8'));
    } else if (option('--host')) {
      notAfter = await notAfterFromHost(option('--host'), Number(option('--port') ?? 443));
    } else {
      throw new Error('uso: --file <cert.pem> | --host <host> [--port 443]');
    }
    return evaluateExpiry(notAfter, now, threshold);
  } catch (error) {
    return { status: 'ERROR', error: error.message };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await probe(process.argv.slice(2));
  console.log(JSON.stringify(result));
  process.exitCode = EXIT_CODES[result.status];
}
