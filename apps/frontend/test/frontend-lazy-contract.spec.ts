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
    'components/admin/metric-trend-plot.tsx',
    'components/projects/burndown-chart-plot.tsx',
    'components/projects/velocity-chart-plot.tsx',
    'components/ui/chart.tsx',
  ],
  // Los módulos de trazado de arriba solo se cargan con next/dynamic desde su envoltorio.
  './metric-trend-plot': [],
  './burndown-chart-plot': [],
  './velocity-chart-plot': [],
  leaflet: ['components/calendar/event-location-picker.tsx'],
  '@tsparticles/': ['components/ui/sparkles.tsx'],
  // Envoltorios de las librerías de arriba: importarlos de forma estática las arrastra igual.
  '@/components/admin/AdminMetricsSection': [],
  '@/components/ui/sparkles': ['components/ui/pricing-section-4.tsx'],
  'react-joyride': ['components/dashboard/OnboardingTour.tsx'],
  '@/components/dashboard/OnboardingTour': [],
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

describe('T-293: secciones secundarias diferidas', () => {
  const adminPage = readFileSync(join(ROOT, 'app/dashboard/admin/page.tsx'), 'utf8');
  const features = readFileSync(join(ROOT, 'components/landing/FeaturesGrid.tsx'), 'utf8');

  it('«Tendencias de uso» se carga con next/dynamic, sin SSR', () => {
    expect(adminPage).toMatch(
      /const AdminMetricsSection = dynamic\(\s*\(\) => import\('@\/components\/admin\/AdminMetricsSection'\)/,
    );
    expect(adminPage).toMatch(/ssr:\s*false/);
  });

  it('el hueco de «Tendencias de uso» conserva el título y el alto de las cinco tarjetas', () => {
    const loading = adminPage.slice(adminPage.indexOf('loading: () => ('), adminPage.indexOf('// ───'));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toMatch(/<h2[^>]*>Tendencias de uso<\/h2>/);
    expect(loading).toContain('length: 5');
    expect(loading).toContain('h-72');
  });

  it('el fondo de partículas de la landing se carga con next/dynamic, sin SSR', () => {
    expect(features).toMatch(/const Sparkles = dynamic\(\(\) => import\("@\/components\/ui\/sparkles"\)/);
    expect(features).toMatch(/ssr:\s*false/);
  });
});

describe('T-293: trabajo redundante en el armazón del estudiante', () => {
  it('la guía de bienvenida se carga con next/dynamic, sin SSR', () => {
    const src = readFileSync(join(ROOT, 'components/dashboard/DashboardLayout.tsx'), 'utf8');
    expect(src).toMatch(
      /const OnboardingTour = dynamic\(\(\) => import\('@\/components\/dashboard\/OnboardingTour'\), \{ ssr: false \}\)/,
    );
    expect(src).toContain('<OnboardingTour />');
  });
});
