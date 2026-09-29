import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { DashboardSearchField } from '../components/dashboard/dashboard-search-field';

// Proyectos Disponibles es la referencia del buscador: todas las vistas con
// buscador principal usan el mismo campo compartido; cada una decide solo su
// ancho. Ninguna vuelve a armar su propia lupa + input con otra altura o borde.
const VISTAS = [
  'app/dashboard/proyectos/page.tsx',
  'app/dashboard/chats/archivados/page.tsx',
  'app/dashboard/mis-tareas/page.tsx',
  'app/dashboard/personas/page.tsx',
  'app/dashboard/projects/mine/page.tsx',
  'app/dashboard/projects/[id]/tareas/tareas-explorer-client.tsx',
  'app/dashboard/proyectos/[id]/bitacora/page.tsx',
  'app/dashboard/admin/usuarios/page.tsx',
];

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
      'hover:border-outline',
      'disabled:opacity-50',
      'disabled:cursor-not-allowed',
    );
    const contenedor = campo.parentElement!;
    expect(contenedor).toHaveClass('relative', 'max-w-md');
    expect(contenedor.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('respeta el estado deshabilitado', () => {
    render(<DashboardSearchField aria-label="Buscar algo" disabled />);
    expect(screen.getByRole('textbox', { name: 'Buscar algo' })).toBeDisabled();
  });

  it.each(VISTAS)('%s usa el buscador compartido', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("from '@/components/dashboard/dashboard-search-field'");
    expect(fuente).toMatch(/<DashboardSearchField\b/);
  });

  it.each(VISTAS)('%s no arma un buscador propio (lupa absoluta sobre un input)', (ruta) => {
    expect(leer(ruta)).not.toMatch(/<Search\b[^>]*absolute/);
  });
});
