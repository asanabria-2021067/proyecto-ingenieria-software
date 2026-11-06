// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FIX-38: toda página de /dashboard muestra su título con `PageTitle` (Rubik,
 * animación y subrayado verde). Guarda estática, sin backend: cada `page.tsx`
 * debe alcanzar un `<PageTitle>` por sus imports (hasta 4 niveles) y ningún
 * archivo del dashboard puede pintar un `<h1>` a mano.
 */

const RAIZ = path.resolve(__dirname, '..');

/** Páginas que solo redirigen: no pintan nada, así que no llevan título. */
const SOLO_REDIRIGEN = [
  'app/dashboard/coordinador/cierres/page.tsx',
  'app/dashboard/mis-proyectos/page.tsx',
  'app/dashboard/proyectos/[id]/editar/page.tsx',
  'app/dashboard/proyectos/[id]/equipo/page.tsx',
  'app/dashboard/proyectos/[id]/tablero/page.tsx',
];

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    return e.isDirectory() ? archivos(ruta) : [ruta];
  });
}

const rel = (f: string) => path.relative(RAIZ, f).replaceAll('\\', '/');

function resolver(desde: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(RAIZ, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(desde), spec) : null;
  if (!base) return null;
  return [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx')].find((c) => fs.existsSync(c)) ?? null;
}

function tienePageTitle(archivo: string, profundidad: number, vistos: Set<string>): boolean {
  const src = fs.readFileSync(archivo, 'utf8');
  if (/<PageTitle\b/.test(src)) return true;
  if (profundidad === 0) return false;
  for (const m of src.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
    const destino = resolver(archivo, m[1]);
    // El aviso de «no eres líder» sustituye a la página, no es su título.
    if (!destino || vistos.has(destino) || destino.includes('leader-only-notice')) continue;
    vistos.add(destino);
    if (tienePageTitle(destino, profundidad - 1, vistos)) return true;
  }
  return false;
}

const paginas = archivos(path.join(RAIZ, 'app/dashboard')).filter((f) => f.endsWith(`${path.sep}page.tsx`));

describe('títulos de página del dashboard (FIX-38)', () => {
  it('encuentra las páginas del dashboard', () => {
    expect(paginas.length).toBeGreaterThan(50);
  });

  it.each(paginas.map(rel))('%s usa PageTitle', (pagina) => {
    if (SOLO_REDIRIGEN.includes(pagina)) return;
    expect(tienePageTitle(path.join(RAIZ, pagina), 4, new Set())).toBe(true);
  });

  it('la lista de páginas que solo redirigen sigue siendo cierta', () => {
    for (const p of SOLO_REDIRIGEN) {
      const src = fs.readFileSync(path.join(RAIZ, p), 'utf8');
      expect(src, p).toMatch(/redirect\(|router\.replace\(/);
    }
  });

  it('ningún archivo del dashboard pinta un <h1> a mano', () => {
    const conH1 = archivos(path.join(RAIZ, 'app/dashboard'))
      .filter((f) => /\.tsx$/.test(f))
      .filter((f) => /<h1[\s>]/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(conH1).toEqual([]);
  });
});
