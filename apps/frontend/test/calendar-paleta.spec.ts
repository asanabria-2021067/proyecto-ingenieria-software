import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIPO_EVENTO_ESTILO, TIPOS_EVENTO_EN_ORDEN, TONO_CLASES, tonoPorIndice } from '@/lib/calendar/paleta';

const CSS = readFileSync(join(__dirname, '..', 'app', 'global.css'), 'utf8');

/** Cuerpo de un bloque de nivel superior (`@theme {…}`, `.dark {…}`). */
function bloque(encabezado: string): string {
  const inicio = CSS.indexOf(encabezado);
  const abre = CSS.indexOf('{', inicio);
  let profundidad = 0;
  for (let i = abre; i < CSS.length; i += 1) {
    if (CSS[i] === '{') profundidad += 1;
    else if (CSS[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return CSS.slice(abre + 1, i);
    }
  }
  return '';
}

describe('calendar/paleta (HU-184)', () => {
  it('los 6 tonos existen en claro y en oscuro, con fondo, texto y borde', () => {
    const claro = bloque('@theme {');
    const oscuro = bloque('.dark {');
    for (let n = 1; n <= 6; n += 1) {
      for (const token of [`cal-${n}`, `on-cal-${n}`, `cal-${n}-strong`]) {
        expect(claro, `--color-${token} en claro`).toMatch(new RegExp(`--color-${token}:`));
        expect(oscuro, `--color-${token} en oscuro`).toMatch(new RegExp(`--color-${token}:`));
      }
    }
  });

  it('cada tono usa sus propias clases (fondo con su on-*)', () => {
    for (let n = 1 as 1 | 2 | 3 | 4 | 5 | 6; n <= 6; n = (n + 1) as typeof n) {
      expect(TONO_CLASES[n].bloque).toBe(`bg-cal-${n} text-on-cal-${n}`);
      expect(TONO_CLASES[n].punto).toBe(`bg-cal-${n}-strong`);
      expect(TONO_CLASES[n].anillo).toBe(`ring-cal-${n}-strong`);
    }
  });

  it('tonoPorIndice cicla 1..6', () => {
    expect([0, 1, 5, 6, 7].map(tonoPorIndice)).toEqual([1, 2, 6, 1, 2]);
  });

  it('cada tipo de evento tiene nombre, ícono y un tono distinto', () => {
    expect(TIPOS_EVENTO_EN_ORDEN).toHaveLength(6);
    const tonos = TIPOS_EVENTO_EN_ORDEN.map((tipo) => TIPO_EVENTO_ESTILO[tipo].tono);
    expect(new Set(tonos).size).toBe(6);
    for (const tipo of TIPOS_EVENTO_EN_ORDEN) {
      expect(TIPO_EVENTO_ESTILO[tipo].label).not.toBe('');
      expect(TIPO_EVENTO_ESTILO[tipo].icon).toBeDefined();
    }
  });
});

/** Valor hexadecimal de `--color-<token>` dentro de un bloque del CSS. */
function token(css: string, nombre: string): string {
  const m = css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`sin token --color-${nombre}`);
  return m[1];
}

/** Luminancia relativa y razón de contraste de WCAG 2.x. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

describe('calendar/paleta — contraste de los indicadores (G04-C04, UI-14)', () => {
  const TEMAS = [
    ['claro', bloque('@theme {')],
    ['oscuro', bloque('.dark {')],
  ] as const;
  const TONOS = [1, 2, 3, 4, 5, 6] as const;

  it('la fórmula de contraste es la de WCAG (negro sobre blanco = 21:1)', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#ffffff', '#ffffff')).toBe(1);
  });

  // 1.4.11 (contraste no textual): bordes, puntos y anillos de cada tono deben
  // distinguirse (≥ 3:1) de la tarjeta, de su propio fondo suave y de la fila gris.
  for (const [tema, css] of TEMAS) {
    it.each(TONOS)(`${tema}: cal-%i-strong alcanza 3:1 sobre la tarjeta, su fondo cal-N y la fila`, (n) => {
      const fuerte = token(css, `cal-${n}-strong`);
      expect(contraste(fuerte, token(css, 'surface-container-lowest'))).toBeGreaterThanOrEqual(3);
      expect(contraste(fuerte, token(css, `cal-${n}`))).toBeGreaterThanOrEqual(3);
      expect(contraste(fuerte, token(css, 'surface-container-low'))).toBeGreaterThanOrEqual(3);
    });

    it.each(TONOS)(`${tema}: el texto on-cal-%i sobre su fondo conserva 4.5:1`, (n) => {
      expect(contraste(token(css, `on-cal-${n}`), token(css, `cal-${n}`))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('el ajuste es solo del tema claro: los tonos fuertes del oscuro y el resto de la paleta clara no cambian', () => {
    const oscuro = bloque('.dark {');
    expect(TONOS.map((n) => token(oscuro, `cal-${n}-strong`))).toEqual(['#a98bf0', '#5cc982', '#6fa4ec', '#e6bd3a', '#ee7fac', '#57c3c3']);
    const claro = bloque('@theme {');
    expect([1, 2, 3, 5].map((n) => token(claro, `cal-${n}-strong`))).toEqual(['#7c4dcc', '#2f9e5a', '#3b7dd8', '#d94b86']);
    expect(TONOS.map((n) => token(claro, `cal-${n}`))).toEqual(['#efe7fb', '#e3f6e8', '#e2eefc', '#fdf3d6', '#fce4ee', '#dcf3f3']);
  });
});
