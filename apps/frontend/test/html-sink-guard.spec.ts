import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * G07-C10 · OWASP25-C006 (A05:2025). Guarda de superficie de los sumideros de
 * HTML del frontend. React escapa todo lo que se renderiza como texto; solo
 * `dangerouslySetInnerHTML` (y las APIs del DOM que interpretan HTML) meten
 * marcado sin escapar. Hoy hay CUATRO usos, todos con contenido fijo del
 * propio código. Un uso nuevo, o una API del DOM que interprete HTML, hace
 * fallar este test: quien lo agregue debe justificarlo aquí. No sustituye los
 * tests de comportamiento.
 */

const ROOT = join(__dirname, '..');
const SCANNED = ['app', 'components', 'hooks', 'lib', 'middleware.ts'];
const DANGEROUS_HTML = /dangerouslySetInnerHTML/g;
const DOM_HTML_SINKS = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write(ln)?\s*\(|new Function\s*\(|\beval\s*\(/g;

export const HTML_SINK_ALLOWLIST: ReadonlyArray<{ file: string; content: string; reason: string }> = [
  {
    file: 'app/layout.tsx',
    content: 'RANDOM_UUID_POLYFILL',
    reason: 'Polyfill de crypto.randomUUID: constante del módulo, sin datos externos.',
  },
  {
    file: 'components/dashboard/OnboardingTour.tsx',
    content: 'plantilla CSS literal sin interpolaciones',
    reason: 'Estilos del spotlight del tour: texto fijo.',
  },
  {
    file: 'components/ui/chart.tsx',
    content: 'CSS de colores desde ChartConfig',
    reason: 'Primitiva de shadcn; ninguna vista usa ChartContainer, así que no recibe datos de usuario.',
  },
  {
    file: 'components/ui/cinematic-landing-hero.tsx',
    content: 'INJECTED_STYLES',
    reason: 'Estilos del hero de la landing: constante del módulo.',
  },
];

function listFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  if (statSync(path).isFile()) {
    return /\.(ts|tsx|js|jsx)$/.test(path) ? [path] : [];
  }
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => listFiles(join(path, entry.name)));
}

function sourceTree(): Record<string, string> {
  const files = SCANNED.flatMap((entry) => listFiles(join(ROOT, entry)));
  return Object.fromEntries(files.map((file) => [relative(ROOT, file), readFileSync(file, 'utf8')]));
}

export function htmlSinkCounts(files: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [file, source] of Object.entries(files)) {
    const found = source.match(DANGEROUS_HTML)?.length ?? 0;
    if (found > 0) {
      counts[file] = found;
    }
  }
  return counts;
}

export function htmlSinkFindings(files: Record<string, string>): string[] {
  const allowed = new Set(HTML_SINK_ALLOWLIST.map(({ file }) => file));
  const findings = Object.entries(htmlSinkCounts(files))
    .filter(([file, count]) => !allowed.has(file) || count !== 1)
    .map(([file, count]) => `dangerouslySetInnerHTML:${file}:${count}`);
  for (const [file, source] of Object.entries(files)) {
    for (const match of source.match(DOM_HTML_SINKS) ?? []) {
      findings.push(`dom-html:${file}:${match.trim()}`);
    }
  }
  return findings.sort();
}

describe('G07-C10: guarda de sumideros de HTML', () => {
  it('exactamente los cuatro usos de la allowlist, uno por archivo', () => {
    expect(htmlSinkCounts(sourceTree())).toEqual(
      Object.fromEntries(HTML_SINK_ALLOWLIST.map(({ file }) => [file, 1])),
    );
    expect(htmlSinkFindings(sourceTree())).toEqual([]);
  });

  it('cada uso permitido inyecta contenido fijo del propio código', () => {
    const files = sourceTree();
    expect(files['app/layout.tsx']).toMatch(/dangerouslySetInnerHTML=\{\{ __html: RANDOM_UUID_POLYFILL \}\}/);
    expect(files['components/ui/cinematic-landing-hero.tsx']).toMatch(/dangerouslySetInnerHTML=\{\{ __html: INJECTED_STYLES \}\}/);

    const tour = files['components/dashboard/OnboardingTour.tsx'];
    const template = /dangerouslySetInnerHTML=\{\{\s*__html: `([^`]*)`/.exec(tour)?.[1];
    expect(template).toBeDefined();
    expect(template).not.toContain('${');

    // La primitiva de gráficos solo inyecta CSS de su ChartConfig y ninguna vista la usa.
    const usesChart = Object.entries(files).filter(
      ([file, source]) => file !== 'components/ui/chart.tsx' && /\bChartContainer\b|\bChartStyle\b/.test(source),
    );
    expect(usesChart.map(([file]) => file)).toEqual([]);
  });

  it.each([
    ['un dangerouslySetInnerHTML nuevo', 'components/nuevo.tsx', '<div dangerouslySetInnerHTML={{ __html: comentario }} />', 'dangerouslySetInnerHTML:components/nuevo.tsx:1'],
    ['un segundo uso en un archivo permitido', 'app/layout.tsx', '<p dangerouslySetInnerHTML={{ __html: a }} /><p dangerouslySetInnerHTML={{ __html: b }} />', 'dangerouslySetInnerHTML:app/layout.tsx:2'],
    ['innerHTML del DOM', 'lib/nuevo.ts', 'el.innerHTML = texto;', 'dom-html:lib/nuevo.ts:.innerHTML ='],
    ['insertAdjacentHTML', 'hooks/nuevo.ts', "el.insertAdjacentHTML('beforeend', texto);", 'dom-html:hooks/nuevo.ts:insertAdjacentHTML('],
  ])('fixture: %s se detecta', (_caso, file, source, finding) => {
    expect(htmlSinkFindings({ [file]: source })).toContain(finding);
  });
});
