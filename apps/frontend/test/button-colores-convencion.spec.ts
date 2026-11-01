import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UI-1: ningún `<Button>` ni `<button>` lleva colores sueltos. El color sale de
 * la variante de `components/ui/button.tsx` (default/principal, secondary,
 * destructive/peligro, ghost/fantasma, link/enlace y tamaños icon) o de los
 * tokens de `app/global.css` (bg-primary, text-on-surface, bg-destructive...).
 * Prohibido: colores de la paleta de Tailwind (red-500, gray-50, white, black...)
 * y colores arbitrarios (#hex, rgb(), hsl(), oklch()).
 */

const RAIZ = join(__dirname, '..');

// Allowlist mínima y justificada. Clave: ruta relativa a apps/frontend.
const PERMITIDOS: Record<string, string> = {
  'components/ui/pricing-section-4.tsx':
    'Demo de librería (solo la importa components/ui/demo.tsx); ninguna ruta de la app lo renderiza.',
};

const PALETA =
  '(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const UTILIDADES = 'bg|text|border|ring|from|to|via|fill|stroke|outline|divide|decoration|accent|caret|shadow';
const SUELTO = new RegExp(
  `(?:^|[\\s"'\`:])(?:[a-z-]+:)*(?:${UTILIDADES})-(?:${PALETA}(?:-\\d+)?(?:/\\d+)?|\\[(?:#|rgb|hsl|oklch|color))`,
  'g',
);

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === '.next') return [];
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return tsx(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

/** Etiquetas de apertura `<Button ...>` / `<button ...>` (respeta `>` dentro de `{}`). */
function etiquetasBoton(fuente: string): { texto: string; linea: number }[] {
  const salida: { texto: string; linea: number }[] = [];
  const re = /<(?:Button|button)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente))) {
    let prof = 0;
    let j = m.index;
    for (; j < fuente.length; j++) {
      const c = fuente[j];
      if (c === '{') prof++;
      else if (c === '}') prof--;
      else if (c === '>' && prof === 0 && fuente[j - 1] !== '=') break;
    }
    salida.push({
      texto: fuente.slice(m.index, j),
      linea: fuente.slice(0, m.index).split('\n').length,
    });
  }
  return salida;
}

function infracciones(fuente: string): string[] {
  return etiquetasBoton(fuente).flatMap(({ texto, linea }) =>
    (texto.match(SUELTO) ?? []).map((c) => `línea ${linea}: ${c.trim()}`),
  );
}

describe('UI-1 · botones sin colores sueltos', () => {
  it('detecta colores de paleta y arbitrarios en <Button> y <button>', () => {
    expect(infracciones('<Button className="bg-red-500 text-white">x</Button>')).toHaveLength(2);
    expect(infracciones('<button className={`a ${y ? "hover:bg-[#153e26]" : ""}`}>x</button>')).toHaveLength(1);
    expect(infracciones('<Button variant="destructive" className="bg-primary text-on-surface">x</Button>')).toEqual([]);
  });

  const archivos = [...tsx(join(RAIZ, 'app')), ...tsx(join(RAIZ, 'components'))]
    .map((ruta) => relative(RAIZ, ruta).replaceAll('\\', '/'))
    .filter((ruta) => !(ruta in PERMITIDOS));

  it('ningún botón de app/ ni components/ usa colores fuera de la convención', () => {
    const fallos = archivos.flatMap((ruta) =>
      infracciones(readFileSync(join(RAIZ, ruta), 'utf8')).map((f) => `${ruta} ${f}`),
    );
    expect(fallos).toEqual([]);
  });

  it('la allowlist solo contiene archivos que existen', () => {
    for (const ruta of Object.keys(PERMITIDOS)) expect(statSync(join(RAIZ, ruta)).isFile()).toBe(true);
  });
});
