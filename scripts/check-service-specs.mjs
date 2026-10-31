// RTF-3.1: todo *.service.ts de apps/backend/src debe tener su *.service.spec.ts
// (en apps/backend/test o junto al servicio), salvo los listados en
// scripts/service-spec-exceptions.txt. La lista solo debe encogerse.
// Uso: node scripts/check-service-specs.mjs [--list-missing]
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const backend = join(root, 'apps', 'backend');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const srcFiles = walk(join(backend, 'src'));
const specs = new Set(
  [...srcFiles, ...walk(join(backend, 'test'))]
    .map((f) => basename(f))
    .filter((n) => n.endsWith('.service.spec.ts')),
);
const missing = srcFiles
  .filter((f) => f.endsWith('.service.ts'))
  .filter((f) => !specs.has(basename(f).replace(/\.ts$/, '.spec.ts')))
  .map((f) => relative(root, f).split('\\').join('/'))
  .sort();

if (process.argv.includes('--list-missing')) {
  console.log(missing.join('\n'));
  process.exit(0);
}

const exceptions = new Set(
  readFileSync(join(root, 'scripts', 'service-spec-exceptions.txt'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);
const nuevos = missing.filter((f) => !exceptions.has(f));
const obsoletas = [...exceptions].filter((f) => !missing.includes(f));

for (const f of obsoletas) console.warn(`AVISO: ya tiene spec o no existe, quitar de la lista de excepciones: ${f}`);
if (nuevos.length > 0) {
  console.error('Servicios sin .service.spec.ts y fuera de la lista de excepciones:');
  for (const f of nuevos) console.error(`  ${f}`);
  console.error('Agrega su spec en apps/backend/test/<nombre>.service.spec.ts (no agregues a la lista de excepciones).');
  process.exit(1);
}
console.log(`OK: ${missing.length} servicios sin spec, todos en la lista de excepciones.`);
