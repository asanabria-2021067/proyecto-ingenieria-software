import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Revisión y corrección de solicitudes de publicación usan el verde salvia
// (tokens `review*`), no naranja. `attention` sigue existiendo para otras
// pantallas (usuarios, calendario de Sprints) y no se toca aquí.
const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf-8');

const VISTAS = [
  'app/dashboard/projects/admin/reviews/page.tsx',
  'app/dashboard/projects/mine/[id]/my-project-view-client.tsx',
  'components/projects/available-project-card.tsx',
  'components/projects/detail/project-general-info-section.tsx',
  'components/admin/ProjectReviewSheet.tsx',
  'components/admin/ProjectFeedbackSheet.tsx',
  'components/admin/RevisionHistoryPanel.tsx',
];

/** Luminancia relativa y contraste WCAG. */
function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [alto, bajo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
}

describe('Acentos de revisión en verde salvia', () => {
  it.each(VISTAS)('%s no conserva naranja ni el token de atención', (ruta) => {
    expect(leer(ruta)).not.toMatch(/\b(?:bg|text|border|ring)-(?:amber|orange)-\d|attention|#A85A00|#FBE8D5/);
  });

  it('los tokens parten del salvia de referencia y el botón da contraste AA con texto blanco', () => {
    const css = leer('app/global.css');
    const token = (nombre: string) => css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`))![1];
    expect(token('review-soft').toLowerCase()).toBe('#9fb880');
    expect(contraste(token('review'), token('on-review'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token('review-strong'), token('on-review'))).toBeGreaterThanOrEqual(4.5);
    // «Aprobar» (primary) y «Revisar» (review) no deben confundirse
    expect(token('review').toLowerCase()).not.toBe('#006735');
  });

  it('la bandeja de cierres conserva su tono propio: solo publicación usa el tono salvia', () => {
    expect(leer('app/dashboard/projects/admin/reviews/page.tsx')).toMatch(/tone="review"/);
    expect(leer('app/dashboard/admin/proyectos/closure-requests-inbox.tsx')).toMatch(/tone="waiting"/);
  });
});
