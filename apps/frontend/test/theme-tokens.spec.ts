import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los primitivos de `components/ui/*` vienen escritos con los nombres de color
 * de shadcn (`text-primary-foreground`, `bg-destructive`, `border-input`…),
 * mientras que el sistema de color del proyecto usa nombres Material
 * (`--color-primary` / `--color-on-primary`).
 *
 * Si un token de shadcn no está definido en `app/global.css`, Tailwind v4 NO
 * genera esa utilidad y la declaración desaparece del CSS sin error alguno:
 * el elemento conserva el resto de sus clases y hereda el color del padre.
 * Así apareció el botón verde oscuro con letra negra — `bg-primary` existía y
 * `text-primary-foreground` no.
 *
 * Estas pruebas leen el CSS real, no un mock, para que ese fallo silencioso
 * vuelva a ser un fallo ruidoso.
 */

const CSS = readFileSync(join(__dirname, '..', 'app', 'global.css'), 'utf8');
const UI_DIR = join(__dirname, '..', 'components', 'ui');

function tokenEstaDefinido(nombre: string): boolean {
  return new RegExp(`^\\s*--color-${nombre}:`, 'm').test(CSS);
}

/** Cuerpo de un bloque de nivel superior (`@theme {…}`, `.dark {…}`). */
function bloque(encabezado: string): string {
  const inicio = CSS.indexOf(encabezado);
  if (inicio === -1) return '';
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

/** Tokens semánticos que consumen los primitivos de shadcn. */
const TOKENS_SHADCN = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

describe('Tokens de color del tema', () => {
  it('cada token semántico de shadcn está definido en global.css', () => {
    const faltantes = TOKENS_SHADCN.filter((t) => !tokenEstaDefinido(t));
    expect(faltantes).toEqual([]);
  });

  it('el botón por defecto declara color de texto y ese token existe (verde oscuro nunca hereda letra negra)', () => {
    const boton = readFileSync(join(UI_DIR, 'button.tsx'), 'utf8');
    const variantePorDefecto = /default:\s*'([^']+)'/.exec(boton)?.[1] ?? '';

    expect(variantePorDefecto).toContain('bg-primary');
    const claseTexto = /\btext-([a-z-]+)\b/.exec(variantePorDefecto)?.[1];
    expect(claseTexto).toBeDefined();
    expect(tokenEstaDefinido(claseTexto as string)).toBe(true);
  });

  it('la insignia por defecto también resuelve su color de texto', () => {
    const badge = readFileSync(join(UI_DIR, 'badge.tsx'), 'utf8');
    const variantePorDefecto = /default:\s*'([^']+)'/.exec(badge)?.[1] ?? '';

    expect(variantePorDefecto).toContain('bg-primary');
    const claseTexto = /\btext-([a-z-]+)\b/.exec(variantePorDefecto)?.[1];
    expect(tokenEstaDefinido(claseTexto as string)).toBe(true);
  });

  it('los alias apuntan a tokens Material que existen en claro y en oscuro', () => {
    const claro = bloque('@theme {');
    const oscuro = bloque('.dark {');

    // Cada alias `--color-x: var(--color-y)` debe resolver contra una `y` real.
    const alias = [...bloque('@theme inline {').matchAll(/--color-([a-z-]+):\s*var\(--color-([a-z-]+)\)/g)];
    expect(alias.length).toBeGreaterThan(0);

    for (const [, , base] of alias) {
      expect(new RegExp(`--color-${base}:`).test(claro), `--color-${base} en tema claro`).toBe(true);
      expect(new RegExp(`--color-${base}:`).test(oscuro), `--color-${base} en tema oscuro`).toBe(true);
    }
  });

  it('el par primary/on-primary contrasta en ambos temas: fondo y texto nunca salen del mismo extremo', () => {
    // Claro: primary oscuro (#006735) con texto blanco. Oscuro: primary claro
    // (#72dc93) con texto oscuro. El alias sigue a `--color-on-primary`, así
    // que basta con que el sistema mantenga esa inversión.
    expect(bloque('@theme {')).toMatch(/--color-on-primary:\s*#ffffff/i);
    expect(bloque('.dark {')).toMatch(/--color-on-primary:\s*#003918/i);
  });
});
