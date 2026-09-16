import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// HU-163: el dashboard solo puede usar los roles de color del sistema de
// diseño (docs/design-system.md). Esta prueba falla si vuelve a colarse una
// clase de color literal de Tailwind (paleta por defecto o hex arbitrario).

const LITERAL_COLOR_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|caret|accent|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;

const dashboardPagePath = join(
  __dirname,
  '..',
  'app',
  'dashboard',
  'page.tsx',
);

describe('Dashboard — tokens de color (HU-163)', () => {
  it('no usa clases de color literales de Tailwind en app/dashboard/page.tsx', () => {
    const source = readFileSync(dashboardPagePath, 'utf-8');
    const matches = source.match(LITERAL_COLOR_CLASS) ?? [];
    expect(matches).toEqual([]);
  });
});
