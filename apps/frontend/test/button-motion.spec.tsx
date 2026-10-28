import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * HU-196 (T-366/T-367): lenguaje compartido de microanimaciones de los botones.
 * El CSS vive en app/global.css; aquí se comprueba el contrato (tokens, guardas de
 * hover, deshabilitado y movimiento reducido) y que `Button` lo aplique por variante.
 */

afterEach(cleanup);

const css = readFileSync(join(__dirname, '../app/global.css'), 'utf8');

/** Cuerpo de la primera regla cuyo selector contiene `selector`. */
const regla = (selector: string): string => {
  const inicio = css.indexOf(selector);
  expect(inicio, selector).toBeGreaterThan(-1);
  return css.slice(inicio, css.indexOf('}', inicio));
};

describe('HU-196 · tokens de movimiento', () => {
  it.each([
    ['--motion-fast', '110ms'],
    ['--motion-base', '180ms'],
    ['--motion-indicator', '200ms'],
  ])('%s vale %s (presionado 100–120, hover 180–200, indicador 180–220)', (token, valor) => {
    expect(css).toContain(`${token}: ${valor};`);
  });

  it('la curva compartida es la ease-out del sistema', () => {
    expect(css).toContain('--motion-ease: var(--ease-out-quart);');
  });

  it('el glow neutro tiene su par en modo oscuro', () => {
    expect(regla(':root {\n  --motion-fast')).toContain('--motion-glow: rgb(0 0 0 / 0.14)');
    expect(css).toMatch(/\.dark \{\n\s+--motion-glow: rgb\(255 255 255 \/ 0\.12\);/);
  });
});

describe('HU-196 · lenguajes de interacción', () => {
  it('motion-action solo anima propiedades sin reflow', () => {
    const cuerpo = regla('.motion-action {');
    for (const prop of ['background-color', 'color', 'border-color', 'box-shadow', 'transform', 'filter']) expect(cuerpo).toContain(prop);
    expect(cuerpo).not.toMatch(/\b(width|height|padding|margin)\b/);
  });

  it('la elevación es de 1 px, solo con puntero real y nunca en deshabilitados', () => {
    const hover = css.slice(css.indexOf('@media (hover: hover) {\n  .motion-action:hover'));
    expect(hover).toContain(".motion-action:hover:not(:disabled, [aria-disabled='true'])");
    expect(hover.slice(0, hover.indexOf('}'))).toContain('transform: translateY(-1px)');
  });

  it('la presión baja a 0 y escala 0.98 con la duración rápida', () => {
    const activo = regla(".motion-action:active:not(:disabled, [aria-disabled='true'])");
    expect(activo).toContain('transform: translateY(0) scale(0.98)');
    expect(activo).toContain('transition-duration: var(--motion-fast)');
  });

  it('motion-control y motion-select no desplazan nada', () => {
    expect(regla('.motion-control {')).not.toContain('transform');
    expect(regla('.motion-select {')).not.toContain('transform');
    expect(regla('.motion-select {')).toContain('var(--motion-indicator)');
  });

  it('motion-link subraya por color, sin sombra ni transform', () => {
    const cuerpo = regla('.motion-link {');
    expect(cuerpo).toContain('text-decoration-color: transparent');
    expect(cuerpo).not.toMatch(/box-shadow|transform/);
    expect(css).toContain('.motion-link:hover {\n    text-decoration-color: currentColor;');
  });

  it.each(['primary', 'sage', 'danger', 'warning'])('motion-glow-%s redefine la sombra contextual', (tono) => {
    expect(css).toMatch(new RegExp(`\\.motion-glow-${tono}\\s*\\{ --motion-glow: `));
  });

  it('motion-focus da un contorno visible de 2 px en el primario', () => {
    expect(regla('.motion-focus:focus-visible')).toContain('outline: 2px solid var(--color-primary)');
  });

  it('con movimiento reducido no hay elevación, escala, brillo ni sombra de hover', () => {
    const reducido = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  html'));
    // Los selectores repiten el `:not(...)` de las reglas de hover/active: con menos
    // especificidad la elevación seguía aplicándose con movimiento reducido.
    const guarda = ":not(:disabled, [aria-disabled='true'])";
    expect(reducido).toContain(`.motion-action:hover${guarda},`);
    expect(reducido).toContain(`.motion-action:active${guarda},`);
    expect(reducido).toContain(`.motion-control:active${guarda},`);
    expect(reducido).toContain(`.motion-icon:active${guarda} svg`);
    expect(reducido).toMatch(/transform: none;\n\s+filter: none;/);
    expect(reducido).toContain(`.motion-action:hover${guarda} {\n    box-shadow: none;`);
  });
});

describe('HU-196 · Button aplica el lenguaje por variante', () => {
  it.each([
    ['default', 'motion-action'],
    ['secondary', 'motion-action'],
    ['destructive', 'motion-action'],
    ['outline', 'motion-control'],
    ['ghost', 'motion-control'],
    ['link', 'motion-link'],
  ] as const)('la variante %s lleva %s y el foco compartido', (variant, clase) => {
    render(
      <Button variant={variant} type="button">
        {variant}
      </Button>,
    );
    const boton = screen.getByRole('button', { name: variant });
    expect(boton).toHaveClass(clase, 'motion-focus');
    expect(boton).not.toHaveClass('transition-all');
  });

  it('cada acción lleva su glow: neutro por defecto, salvia, rojo', () => {
    expect(buttonVariants({ variant: 'default' })).not.toMatch(/motion-glow-/);
    expect(buttonVariants({ variant: 'secondary' })).toContain('motion-glow-sage');
    expect(buttonVariants({ variant: 'destructive' })).toContain('motion-glow-danger');
  });

  it('un botón deshabilitado queda deshabilitado de verdad y sin puntero', () => {
    render(
      <Button type="button" disabled>
        Guardar
      </Button>
    );
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveClass('disabled:pointer-events-none');
  });

  it('un botón en carga sigue deshabilitado y conserva su etiqueta accesible', () => {
    render(
      <Button type="button" disabled aria-busy="true">
        Guardando…
      </Button>
    );
    const boton = screen.getByRole('button', { name: 'Guardando…' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
  });
});
