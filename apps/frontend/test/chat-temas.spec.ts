import { describe, expect, it } from 'vitest';
import { CHAT_TEMAS, claseAcentoCabecera, claseBurbujaPropia } from '../lib/chat-temas';
import type { ChatTemaColor } from '../lib/types/chat';

// Hex de la paleta Tailwind para los tonos usados en lib/chat-temas.ts
// (fondo 700 / texto blanco en claro; fondo 300 / texto 950 en oscuro).
const HEX: Record<string, string> = {
  'green-700': '#15803d', 'green-300': '#86efac', 'green-950': '#052e16',
  'blue-700': '#1d4ed8', 'blue-300': '#93c5fd', 'blue-950': '#172554',
  'violet-700': '#6d28d9', 'violet-300': '#c4b5fd', 'violet-950': '#2e1065',
  'orange-700': '#c2410c', 'orange-300': '#fdba74', 'orange-950': '#431407',
  'pink-700': '#be185d', 'pink-300': '#f9a8d4', 'pink-950': '#500724',
  'slate-700': '#334155', 'slate-300': '#cbd5e1', 'slate-950': '#020617',
  white: '#ffffff',
};

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const claves = Object.keys(CHAT_TEMAS) as ChatTemaColor[];

/** Valor del token de un prefijo en la cadena de clases, p. ej. 'bg-' -> 'green-700'. */
function token(clases: string, prefijo: string): string {
  const clase = clases.split(' ').find((c) => c.startsWith(prefijo));
  if (!clase) throw new Error(`falta ${prefijo} en "${clases}"`);
  return clase.slice(prefijo.length);
}

describe('paleta de temas del chat', () => {
  it('la utilidad de contraste reproduce valores conocidos', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it.each(claves)('%s: texto sobre burbuja propia cumple WCAG AA en claro y oscuro', (clave) => {
    const { burbuja } = CHAT_TEMAS[clave];
    const claro = contraste(HEX[token(burbuja, 'bg-')], HEX[token(burbuja, 'text-')]);
    const oscuro = contraste(HEX[token(burbuja, 'dark:bg-')], HEX[token(burbuja, 'dark:text-')]);

    expect(claro).toBeGreaterThanOrEqual(4.5);
    expect(oscuro).toBeGreaterThanOrEqual(4.5);
  });

  it.each(claves)('%s: cada variante clara trae su par oscuro y tiene nombre', (clave) => {
    const tema = CHAT_TEMAS[clave];
    expect(tema.nombre.length).toBeGreaterThan(0);
    for (const clases of [tema.burbuja, tema.acento, tema.muestra]) {
      expect(clases).toContain('dark:');
    }
  });

  it('mapea clave a clases y usa el color por defecto sin tema', () => {
    expect(claseBurbujaPropia('azul')).toBe(CHAT_TEMAS.azul.burbuja);
    expect(claseAcentoCabecera('azul')).toBe(CHAT_TEMAS.azul.acento);
    expect(claseBurbujaPropia(null)).toBe('bg-primary text-primary-foreground');
    expect(claseBurbujaPropia(undefined)).toBe('bg-primary text-primary-foreground');
    expect(claseAcentoCabecera(null)).toBe('');
  });

  it('una clave desconocida cae al color por defecto', () => {
    expect(claseBurbujaPropia('magenta' as ChatTemaColor)).toBe('bg-primary text-primary-foreground');
  });
});
