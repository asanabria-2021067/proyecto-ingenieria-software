import '@testing-library/jest-dom/vitest';
import { readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageTitle } from '@/components/ui/page-title';
import { tsx } from './helpers/listar-tsx';

afterEach(cleanup);

const RAIZ = join(__dirname, '..');
const css = readFileSync(join(RAIZ, 'app/global.css'), 'utf8');

// Únicos <h1> sueltos permitidos.
const PERMITIDOS: Record<string, string> = {
  'components/ui/page-title.tsx': 'Es el componente.',
  'components/ui/cinematic-landing-hero.tsx': 'Hero de la landing con animación GSAP propia.',
  'components/dashboard/page.tsx': 'Placeholder heredado sin ruta.',
  'components/login/page.tsx': 'Placeholder heredado sin ruta.',
  'app/e2e/error-simulado/provocar-error.tsx': 'Página de prueba E2E de errores.',
};

describe('UI-2 · PageTitle', () => {
  it('renderiza un h1 con la clase de título de página', () => {
    render(<PageTitle className="extra">Hola</PageTitle>);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Hola' });
    expect(h1).toHaveClass('page-title', 'extra');
  });

  it('Rubik solo se usa en .page-title; con subrayado lima y sin animación si hay movimiento reducido', () => {
    const regla = css.slice(css.indexOf('.page-title {'));
    expect(regla).toContain('var(--font-family-title)');
    expect(regla).toContain('var(--color-brand-lime)');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.page-title \{\s*animation: none;/);
    expect(css.match(/--font-rubik/g)).toHaveLength(1);
  });

  it('ninguna pantalla usa <h1> directo: todas pasan por PageTitle', () => {
    const sueltos = [...tsx(join(RAIZ, 'app')), ...tsx(join(RAIZ, 'components'))]
      .map((r) => relative(RAIZ, r).replaceAll('\\', '/'))
      .filter((r) => !(r in PERMITIDOS) && /<h1[\s>]/.test(readFileSync(join(RAIZ, r), 'utf8')));
    expect(sueltos).toEqual([]);
  });
});
