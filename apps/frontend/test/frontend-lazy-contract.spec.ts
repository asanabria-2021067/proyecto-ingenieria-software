import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-293: contrato de carga diferida. Las librerías pesadas solo pueden
 * importarse de forma estática desde los módulos de esta lista; cualquier otro
 * import las metería en el JS inicial de alguna ruta sin que nadie lo decida.
 */
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks'];

export const HEAVY: Record<string, string[]> = {
  recharts: [
    'components/admin/AdminMetricsSection.tsx',
    'components/projects/burndown-chart.tsx',
    'components/projects/velocity-chart.tsx',
    'components/ui/chart.tsx',
  ],
  leaflet: ['components/calendar/event-location-picker.tsx'],
  '@tsparticles/': ['components/ui/sparkles.tsx'],
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

export function staticImporters(pkg: string, files: Array<[string, string]>): string[] {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // Import estático de valor: `import ... from 'pkg'` (no `import type`, no `import()`).
  const re = new RegExp(`^import\\s+(?!type\\b)[^;]*?from\\s+['"]${escaped}[^'"]*['"]`, 'm');
  return files.filter(([, src]) => re.test(src)).map(([file]) => file);
}

const FILES: Array<[string, string]> = DIRS.flatMap((d) => sources(join(ROOT, d))).map((f) => [
  relative(ROOT, f),
  readFileSync(f, 'utf8'),
]);

describe('T-293: imports estáticos de librerías pesadas', () => {
  for (const [pkg, allowed] of Object.entries(HEAVY)) {
    it(`${pkg} solo se importa desde sus módulos propios`, () => {
      expect(staticImporters(pkg, FILES).sort()).toEqual([...allowed].sort());
    });
  }

  it('el detector ve un import estático y descarta los de tipo y los dinámicos', () => {
    const fixtures: Array<[string, string]> = [
      ['a.tsx', "import { Line } from 'recharts';"],
      ['b.tsx', "import {\n  Line,\n} from 'recharts';"],
      ['c.tsx', "import type { LineProps } from 'recharts';"],
      ['d.tsx', "const m = () => import('recharts');"],
      ['e.tsx', "import L from 'leaflet';"],
    ];
    expect(staticImporters('recharts', fixtures)).toEqual(['a.tsx', 'b.tsx']);
  });
});

describe('T-293: módulos ya diferidos', () => {
  it('el mapa de lugar del evento se carga con next/dynamic y sin SSR', () => {
    const src = readFileSync(join(ROOT, 'components/calendar/event-form-dialog.tsx'), 'utf8');
    expect(src).toMatch(/dynamic\(\(\) => import\('\.\/event-location-picker'\)/);
    expect(src).toMatch(/ssr:\s*false/);
    expect(src).not.toMatch(/^import .*from '\.\/event-location-picker'/m);
  });
});
