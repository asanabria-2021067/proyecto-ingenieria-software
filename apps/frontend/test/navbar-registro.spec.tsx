import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('next/image', () => ({ default: () => null }));

// `useLinkStatus` solo es true durante una navegación real de Next; aquí se controla.
const estadoEnlace = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement('a', { href, ...props }, children),
  useLinkStatus: () => estadoEnlace,
}));

import Navbar from '../components/landing/Navbar';

afterEach(() => {
  cleanup();
  estadoEnlace.pending = false;
});

/**
 * NL-T2: /registro tarda en abrir y el visitante volvía a hacer clic. Mientras
 * la navegación está pendiente (useLinkStatus) el enlace muestra «Abriendo…»;
 * sin navegación (Ctrl/Cmd/clic central) nunca queda pegado.
 */
describe('NL-T2: «Registrarse» en la navbar', () => {
  it('en reposo dice «Registrarse» y apunta al formulario', () => {
    const { container } = render(<Navbar />);
    const enlace = within(container.querySelector('nav') as HTMLElement).getByRole('link', { name: 'Registrarse' });
    expect(enlace).toHaveAttribute('href', '/registro');
  });

  it('con la navegación pendiente muestra «Abriendo…» con indicador y conserva el destino', () => {
    estadoEnlace.pending = true;
    render(<Navbar />);

    const ocupado = screen.getByRole('link', { name: /Abriendo/ });
    expect(ocupado).toHaveAttribute('href', '/registro');
    expect(within(ocupado).getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('en móvil el menú sigue abierto tras el clic para que se vea «Abriendo…»', () => {
    const { container } = render(<Navbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const menu = container.querySelector('nav > div.md\\:hidden') as HTMLElement;

    fireEvent.click(within(menu).getByRole('link', { name: 'Registrarse' }));

    expect(container.querySelector('nav > div.md\\:hidden')).not.toBeNull();
  });
});
