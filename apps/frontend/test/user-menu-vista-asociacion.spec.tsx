import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

Element.prototype.scrollIntoView = () => {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next/image', () => ({ default: () => null }));

import { UserMenu } from '../components/dashboard/UserMenu';

const user = { nombre: 'Ana', apellido: 'Santos', correo: 'san24725@uvg.edu.gt' };
const juntas = [{ idAsociacion: 7, nombre: 'AEC', logoUrl: null, cargo: 'VOCAL' as const, nivelPermiso: 'LECTURA' as const }];

function abrir() {
  render(<UserMenu user={user} onLogout={vi.fn()} juntas={juntas} />);
  fireEvent.keyDown(screen.getByRole('button', { name: /Ana Santos/ }), { key: 'Enter' });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  nav.pathname = '/dashboard';
});

describe('ASO: cambio de vista en el menú de cuenta', () => {
  it('quien no es de junta no ve el cambio de vista', async () => {
    render(<UserMenu user={user} onLogout={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Ana Santos/ }), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: 'Mi perfil' });
    expect(screen.queryByRole('menuitem', { name: 'Estudiante' })).toBeNull();
  });

  it('ofrece Estudiante y Asociación <nombre>, con Estudiante activa en el dashboard', async () => {
    abrir();
    expect(await screen.findByRole('menuitem', { name: 'Estudiante' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('menuitem', { name: 'Asociación AEC' })).not.toHaveAttribute('aria-current');
  });

  it('cada opción lleva a su vista: Asociación al dashboard de la asociación, Estudiante al dashboard', async () => {
    abrir();
    expect(await screen.findByRole('menuitem', { name: 'Asociación AEC' })).toHaveAttribute('href', '/dashboard/asociacion/7');
    expect(screen.getByRole('menuitem', { name: 'Estudiante' })).toHaveAttribute('href', '/dashboard');
  });

  it('en la vista de asociación esa opción queda activa', async () => {
    nav.pathname = '/dashboard/asociacion/7';
    abrir();
    expect(await screen.findByRole('menuitem', { name: 'Asociación AEC' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('menuitem', { name: 'Estudiante' })).not.toHaveAttribute('aria-current');
  });
});
