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

  it('los tokens usan el salvia #9AB07E exacto: texto blanco en claro y negro en oscuro', () => {
    const css = leer('app/global.css');
    const token = (nombre: string) => css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`))![1];
    expect(token('review').toLowerCase()).toBe('#9ab07e');
    expect(token('review-soft').toLowerCase()).toBe('#9ab07e');
    expect(contraste(token('review-ink'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // «Aprobar» (primary) y «Revisar» (review) no deben confundirse
    expect(token('review').toLowerCase()).not.toBe('#006735');
  });

  it('on-review es texto oscuro en claro y en oscuro', () => {
    const css = leer('app/global.css');
    const token = (nombre: string) => css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`))![1];
    const oscuro = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
    expect(oscuro).toMatch(/--color-on-review:\s*#000000/);
    const base = css.replace(oscuro, '');
    expect(base).toMatch(/--color-on-review:\s*#1f2d18/);
    const onClaro = base.match(/--color-on-review:\s*(#[0-9a-fA-F]{6})/)![1];
    for (const fondo of [token('review'), token('review-strong')]) {
      expect(contraste(fondo, onClaro)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(fondo, '#000000')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('la pill pulsa con un anillo de opacidad, sin animar color ni fondo', () => {
    const css = leer('app/global.css');
    expect(css).not.toContain('blink-gold-gray');
    const regla = (sel: string) => css.match(new RegExp(`${sel.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`))![1];
    const anim = regla('.pill-pulse::after').match(/animation:\s*([\w-]+)/)![1];
    const kf = css.match(new RegExp(`@keyframes ${anim}\\s*\\{[\\s\\S]*?\\n\\}`))![0];
    expect(kf).not.toMatch(/background-color|(?<![-\w])color\s*:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pill-pulse::after\s*\{[^}]*animation:\s*none/);
  });

  it('la bandeja de cierres conserva su tono propio: solo publicación usa el tono salvia', () => {
    expect(leer('app/dashboard/projects/admin/reviews/page.tsx')).toMatch(/tone="review"/);
    expect(leer('app/dashboard/admin/proyectos/closure-requests-inbox.tsx')).toMatch(/tone="waiting"/);
  });
});
