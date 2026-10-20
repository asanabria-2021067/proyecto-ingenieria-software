import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FG10-C01 (T-317). Correcciones de contraste derivadas de la auditoría de
 * T-316 (`docs/qa/sprint9/accesibilidad-auditoria.md`, A11Y-01 y A11Y-02).
 *
 * Aquí se comprueba el contraste de los TOKENS con la fórmula de WCAG y los
 * fondos que la auditoría midió en pantalla. Que el navegador pinta esos
 * colores lo confirma la reauditoría con axe y Lighthouse.
 */

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const css = leer('app/global.css');

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const luminancia = ([r, g, b]: Rgb) => {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
/** Razón de contraste WCAG entre un texto y su fondo. */
const contraste = (texto: Rgb, fondo: Rgb) => {
  const [clara, oscura] = [luminancia(texto), luminancia(fondo)].sort((a, b) => b - a);
  return (clara + 0.05) / (oscura + 0.05);
};
/** Color que resulta de pintar `texto` con opacidad `alfa` sobre `fondo`. */
const sobre = (texto: Rgb, fondo: Rgb, alfa: number): Rgb => texto.map((v, i) => Math.round(v * alfa + fondo[i] * (1 - alfa))) as Rgb;

/** Valor de un token de color en el tema claro (primer bloque) o en `.dark`. */
function token(nombre: string, tema: 'claro' | 'oscuro'): string {
  const bloque = tema === 'claro' ? css.slice(0, css.indexOf('\n.dark {')) : css.slice(css.indexOf('\n.dark {'));
  const valor = bloque.match(new RegExp(`--color-${nombre}: (#[0-9a-fA-F]{6});`));
  if (!valor) throw new Error(`no se encontró --color-${nombre} (${tema})`);
  return valor[1];
}

const AA_TEXTO_NORMAL = 4.5;

describe('FG10-C01 · A11Y-01: rótulos sobre `primary` en el dashboard del estudiante', () => {
  // Fondos realmente pintados en las tarjetas, medidos por axe en la línea base.
  const FONDO = { claro: rgb('#1a7649'), oscuro: rgb('#67cc87') };

  it('el token `on-primary-muted` es `on-primary` al 90 %', () => {
    expect(css).toContain('--color-on-primary-muted: color-mix(in srgb, var(--color-on-primary) 90%, transparent);');
  });

  it.each(['claro', 'oscuro'] as const)('tema %s: al 70 % no alcanzaba AA (reproduce el hallazgo)', (tema) => {
    const antes = contraste(sobre(rgb(token('on-primary', tema)), FONDO[tema], 0.7), FONDO[tema]);
    expect(antes).toBeLessThan(AA_TEXTO_NORMAL);
    expect(antes).toBeGreaterThan(3.5);
  });

  it.each([
    ['claro', 4.88],
    ['oscuro', 5.38],
  ] as const)('tema %s: al 90 % alcanza AA (%s:1)', (tema, esperado) => {
    const despues = contraste(sobre(rgb(token('on-primary', tema)), FONDO[tema], 0.9), FONDO[tema]);
    expect(despues).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    expect(despues).toBeCloseTo(esperado, 1);
  });

  it('también cumple sobre el `primary` puro de cada tema, no solo sobre el fondo medido', () => {
    for (const tema of ['claro', 'oscuro'] as const) {
      const fondo = rgb(token('primary', tema));
      expect(contraste(sobre(rgb(token('on-primary', tema)), fondo, 0.9), fondo), tema).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    }
  });

  it('el dashboard ya no pinta rótulos con la opacidad del 70 % ni fija colores por instancia', () => {
    const pagina = leer('app/dashboard/page.tsx');
    expect(pagina).not.toContain('text-on-primary/70');
    expect(pagina).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe('Paleta salvia del estudiante: sidebar y tarjeta de bienvenida', () => {
  const AA_GRAFICO = 3;

  it('la tarjeta de bienvenida y sus KPI usan los tokens salvia, no `primary`', () => {
    const pagina = leer('app/dashboard/page.tsx');
    const tarjeta = pagina.slice(pagina.indexOf('{/* Welcome + Stats */}'), pagina.indexOf('<div className="layout-grid">'));
    const kpi = pagina.slice(pagina.indexOf('function HorasKpiCard({'), pagina.indexOf('\n}\n', pagina.indexOf('function HorasKpiCard({')));
    for (const bloque of [tarjeta, kpi]) {
      expect(bloque).not.toMatch(/\b(bg|text|border)-(primary|on-primary|accent)\b/);
      expect(bloque).toContain('text-sage-ink-muted');
    }
    expect(tarjeta).toContain('bg-sage-welcome');
    expect(tarjeta.match(/bg-sage-kpi\b/g)?.length).toBe(3);
    expect(kpi).toContain('bg-sage-kpi');
  });

  it.each([
    ['ink', 'surface'],
    ['ink-soft', 'surface'],
    ['ink-muted', 'surface'],
    ['ink', 'active'],
    ['ink', 'hover'],
    ['ink', 'welcome'],
    ['ink-soft', 'welcome'],
    ['ink-muted', 'welcome'],
    ['ink', 'kpi'],
    ['ink-muted', 'kpi'],
    ['on-avatar', 'avatar'],
  ] as const)('texto %s sobre %s alcanza AA en claro y en oscuro', (texto, fondo) => {
    for (const tema of ['claro', 'oscuro'] as const) {
      expect(contraste(rgb(token(`sage-${texto}`, tema)), rgb(token(`sage-${fondo}`, tema))), tema).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    }
  });

  it.each([
    ['accent', 'surface'],
    ['accent', 'kpi'],
    ['accent', 'track'],
    ['accent', 'open'],
  ] as const)('acento (iconos, barra activa y progreso) %s sobre %s alcanza 3:1 en claro y en oscuro', (color, fondo) => {
    for (const tema of ['claro', 'oscuro'] as const) {
      expect(contraste(rgb(token(`sage-${color}`, tema)), rgb(token(`sage-${fondo}`, tema))), tema).toBeGreaterThanOrEqual(AA_GRAFICO);
    }
  });

  it('la sidebar del estudiante solo reasigna los tokens `--admin-*` dentro de su propia clase', () => {
    expect(leer('components/dashboard/DashboardLayout.tsx')).toMatch(/admin-sidebar student-sidebar/);
    expect(leer('components/admin/AdminLayout.tsx')).not.toContain('student-');
    expect(css).toMatch(/\.student-sidebar,\n\.student-account-menu \{[^}]*--admin-bg: var\(--color-sage-surface\);/);
  });
});

describe('FG10-C01 · A11Y-02: días de otro mes en el mini calendario de Sprints', () => {
  // Fondo de tarjeta de cada tema, el que midió axe.
  const FONDO = { claro: rgb(token('surface-container-lowest', 'claro')), oscuro: rgb(token('surface-container-lowest', 'oscuro')) };

  it('los fondos de tarjeta son los que registró la auditoría', () => {
    expect(token('surface-container-lowest', 'claro')).toBe('#ffffff');
    expect(token('surface-container-lowest', 'oscuro')).toBe('#080b0e');
  });

  it.each(['claro', 'oscuro'] as const)('tema %s: el tono «disabled» (38 %) no alcanzaba AA', (tema) => {
    const antes = contraste(sobre(rgb(token('on-surface', tema)), FONDO[tema], 0.38), FONDO[tema]);
    expect(antes).toBeLessThan(AA_TEXTO_NORMAL);
  });

  it.each(['claro', 'oscuro'] as const)('tema %s: el tono «secondary» alcanza AA con margen', (tema) => {
    const despues = contraste(rgb(token('on-surface-variant', tema)), FONDO[tema]);
    expect(despues).toBeGreaterThanOrEqual(7);
  });

  it('el widget pide el tono «secondary», que el mini calendario ya ofrecía', () => {
    expect(leer('components/admin/dashboard/sprint-planning-widget.tsx')).toContain('adjacentMonthTone="secondary"');
    const mini = leer('components/calendar/mini-calendar.tsx');
    expect(mini).toContain("adjacentMonthTone?: 'disabled' | 'secondary';");
    expect(mini).toContain("? 'text-text-secondary'");
  });

  it('el valor por defecto del mini calendario no cambió: los demás usos conservan su aspecto', () => {
    expect(leer('components/calendar/mini-calendar.tsx')).toContain(": 'text-text-disabled'");
  });

  it('`text-secondary` y `text-disabled` siguen saliendo de los mismos tokens', () => {
    expect(css).toContain('--color-text-secondary: var(--color-on-surface-variant);');
    expect(css).toContain('--color-text-disabled: color-mix(in srgb, var(--color-on-surface) 38%, transparent);');
  });
});
