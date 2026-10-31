import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('next/image', () => ({ default: () => null }));

import Navbar from '../components/landing/Navbar';

afterEach(() => cleanup());

/**
 * NL-T2: /registro tarda en abrir y el visitante volvía a hacer clic. Un clic
 * debe dar respuesta visible al instante y el enlace debe seguir apuntando al formulario.
 */
describe('NL-T2: «Registrarse» en la navbar', () => {
  it('un solo clic muestra «Abriendo…», marca el enlace como ocupado y conserva el destino', () => {
    const { container } = render(<Navbar />);
    const enlace = within(container.querySelector('nav') as HTMLElement).getByRole('link', { name: 'Registrarse' });
    expect(enlace).toHaveAttribute('href', '/registro');
    expect(enlace).not.toHaveAttribute('aria-busy', 'true');

    fireEvent.click(enlace);

    const ocupado = screen.getByRole('link', { name: /Abriendo/ });
    expect(ocupado).toHaveAttribute('href', '/registro');
    expect(ocupado).toHaveAttribute('aria-busy', 'true');
    expect(within(ocupado).getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('en móvil el menú sigue abierto tras el clic para que se vea «Abriendo…»', () => {
    const { container } = render(<Navbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const menu = container.querySelector('nav > div.md\\:hidden') as HTMLElement;

    fireEvent.click(within(menu).getByRole('link', { name: 'Registrarse' }));

    expect(container.querySelector('nav > div.md\\:hidden')).not.toBeNull();
    expect(within(menu).getByRole('link', { name: /Abriendo/ })).toHaveAttribute('aria-busy', 'true');
  });
});
