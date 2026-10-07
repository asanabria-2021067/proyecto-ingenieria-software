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
