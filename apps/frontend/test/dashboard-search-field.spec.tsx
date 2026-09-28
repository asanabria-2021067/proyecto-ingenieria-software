import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { DashboardSearchField } from '../components/dashboard/dashboard-search-field';

// Proyectos Disponibles es la referencia del buscador; Chats archivados usa el
// mismo campo compartido en lugar de su propio Input con otra altura y borde.
const VISTAS = ['app/dashboard/proyectos/page.tsx', 'app/dashboard/chats/archivados/page.tsx'];

const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf-8');

describe('DashboardSearchField', () => {
  it('conserva el tratamiento de Proyectos Disponibles: alto, borde, radio, fondo, foco y lupa', () => {
    render(<DashboardSearchField aria-label="Buscar algo" placeholder="Buscar..." containerClassName="max-w-md" />);

    const campo = screen.getByRole('textbox', { name: 'Buscar algo' });
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveAttribute('placeholder', 'Buscar...');
    expect(campo).toHaveClass(
      'h-11.5',
      'rounded-lg',
      'border-outline-variant',
      'bg-surface-container-lowest',
      'pl-10',
      'focus:ring-2',
      'focus:ring-primary',
    );
    const contenedor = campo.parentElement!;
    expect(contenedor).toHaveClass('relative', 'max-w-md');
    expect(contenedor.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(VISTAS)('%s usa el buscador compartido', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("from '@/components/dashboard/dashboard-search-field'");
    expect(fuente).toMatch(/<DashboardSearchField\b/);
  });
});
