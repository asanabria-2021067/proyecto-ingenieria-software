#!/usr/bin/env node
/**
 * Comparador del baseline nginx versionado (G02-C16 · OWASP25-C047).
 *
 * Demuestra que la configuración viva de la VM es equivalente a la versionada
 * en infra/nginx salvo las exclusiones DECLARADAS en manifest.json (rutas de
 * otros proyectos que comparten el server). No depende de nada fuera de Node.
 *
 * Uso (solo lectura, p. ej. el operador antes de aplicar P1):
 *   node infra/nginx/compare-live.mjs <copia-viva-del-site> [<copia-viva-de-nginx.conf>]
 * Sale con 0 si todo coincide y con 1 ante cualquier diferencia no declarada.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NGINX_DIR = dirname(fileURLToPath(import.meta.url));
export const EXCLUSION_MARKER = '# @g02-excluded-locations';

/** Líneas del marcador de exclusión que solo existen en la copia versionada. */
export function isMarkerLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith(EXCLUSION_MARKER) || trimmed.startsWith('# [G02-C16]');
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function loadManifest() {
  return JSON.parse(readFileSync(join(NGINX_DIR, 'manifest.json'), 'utf8'));
}

/** Quita los bloques `location <ruta> { ... }` indicados (llaves balanceadas por línea). */
export function removeLocations(text, paths) {
  const lines = text.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\s*location\s+(\S+)\s*\{\s*$/.exec(lines[i]);
    if (match && paths.includes(match[1])) {
      let depth = 1;
      while (depth > 0 && i + 1 < lines.length) {
        i += 1;
        depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
      }
      continue;
    }
    kept.push(lines[i]);
  }
  return kept.join('\n');
}

/** Forma canónica: sin exclusiones declaradas, sin el marcador y con líneas en blanco colapsadas. */
export function canonicalSite(text, { excludedLocations, excludedComments }) {
  const withoutBlocks = removeLocations(text, excludedLocations);
  const lines = withoutBlocks
    .split('\n')
    .filter((line) => !excludedComments.includes(line.trim()))
    .filter((line) => !isMarkerLine(line));
  const collapsed = [];
  for (const line of lines) {
    if (line.trim() === '' && collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') {
      continue;
    }
    collapsed.push(line);
  }
  return collapsed.join('\n');
}

/** Compara el site vivo con el versionado. Devuelve la lista de diferencias (vacía = equivalente). */
export function compareSite(liveText, versionedText, entry) {
  const findings = [];
  const live = canonicalSite(liveText, entry).split('\n');
  const versioned = canonicalSite(versionedText, entry).split('\n');
  const length = Math.max(live.length, versioned.length);
  for (let i = 0; i < length; i += 1) {
    if (live[i] !== versioned[i]) {
      findings.push(`linea ${i + 1}: vivo=${JSON.stringify(live[i] ?? null)} versionado=${JSON.stringify(versioned[i] ?? null)}`);
    }
  }
  return findings;
}

function main(argv) {
  const [livePath, liveConfPath] = argv;
  if (!livePath) {
    console.error('Uso: node infra/nginx/compare-live.mjs <copia-viva-del-site> [<copia-viva-de-nginx.conf>]');
    return 2;
  }
  const manifest = loadManifest();
  const failures = [];
  for (const entry of manifest.files) {
    const versioned = readFileSync(join(NGINX_DIR, entry.path), 'utf8');
    if (sha256(versioned) !== entry.versionedSha256) {
      failures.push(`${entry.path}: el archivo versionado no coincide con manifest.json`);
    }
  }
  const site = manifest.files.find((entry) => entry.mode === 'sanitized');
  const liveSite = readFileSync(livePath, 'utf8');
  if (sha256(liveSite) !== site.liveSha256) {
    console.log(`AVISO: el site vivo cambió respecto de la captura (${site.liveSha256.slice(0, 16)}…)`);
  }
  const siteDiff = compareSite(liveSite, readFileSync(join(NGINX_DIR, site.path), 'utf8'), site);
  failures.push(...siteDiff.map((finding) => `${site.path}: ${finding}`));
  if (liveConfPath) {
    const conf = manifest.files.find((entry) => entry.mode === 'verbatim');
    if (sha256(readFileSync(liveConfPath, 'utf8')) !== conf.versionedSha256) {
      failures.push(`${conf.path}: la copia viva difiere del baseline verbatim`);
    }
  }
  if (failures.length > 0) {
    console.log('FAIL');
    failures.forEach((failure) => console.log(`- ${failure}`));
    return 1;
  }
  console.log('PASS: la configuración viva equivale al baseline versionado (exclusiones declaradas aparte)');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
