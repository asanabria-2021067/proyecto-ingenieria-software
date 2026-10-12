#!/usr/bin/env node
/**
 * T-293: JS inicial por ruta del build de producción de Next.
 *
 * Lee `apps/frontend/.next` (hay que haber corrido `next build` antes) y, por
 * cada página del App Router, suma los chunks que el HTML inicial referencia:
 * los `rootMainFiles` más los `entryJSFiles` de la página y de sus layouts.
 * Los chunks de `next/dynamic` no están en esas listas: por eso diferir un
 * módulo baja la cifra de la ruta.
 *
 * Uso: node scripts/qa/sprint9-bundle-measure.mjs [--json] [filtro-de-ruta]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const NEXT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../apps/frontend/.next');
const APP_DIR = join(NEXT_DIR, 'server/app');
const MANIFEST = 'page_client-reference-manifest.js';

if (!existsSync(join(NEXT_DIR, 'BUILD_ID'))) {
  console.error('No hay build de producción: corre `npm run build` en apps/frontend.');
  process.exit(66);
}

const rootMain = JSON.parse(readFileSync(join(NEXT_DIR, 'build-manifest.json'), 'utf8')).rootMainFiles ?? [];
const sizes = new Map();
function size(file) {
  if (!sizes.has(file)) {
    const buf = readFileSync(join(NEXT_DIR, file));
    sizes.set(file, { raw: buf.length, gzip: gzipSync(buf).length });
  }
  return sizes.get(file);
}

function manifests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? manifests(join(dir, e.name)) : e.name === MANIFEST ? [join(dir, e.name)] : [],
  );
}

function measure(manifestPath) {
  const sandbox = {};
  // El manifiesto es un script que asigna en globalThis.__RSC_MANIFEST.
  new Function('globalThis', readFileSync(manifestPath, 'utf8'))(sandbox);
  const [entry] = Object.values(sandbox.__RSC_MANIFEST);
  const files = new Set(rootMain);
  for (const list of Object.values(entry.entryJSFiles ?? {})) for (const f of list) files.add(f);
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const s = size(decodeURIComponent(f));
    raw += s.raw;
    gzip += s.gzip;
  }
  const route = '/' + relative(APP_DIR, dirname(manifestPath)).replace(/\/?page$/, '');
  return { route: route.replace(/\/$/, '') || '/', chunks: files.size, raw, gzip };
}

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const rows = manifests(APP_DIR)
  .map(measure)
  .filter((r) => r.route.includes(filter))
  .sort((a, b) => b.gzip - a.gzip);

if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('| Ruta | Chunks | JS (bytes) | JS gzip (bytes) |\n|---|---:|---:|---:|');
  for (const r of rows) console.log(`| \`${r.route}\` | ${r.chunks} | ${r.raw} | ${r.gzip} |`);
}
