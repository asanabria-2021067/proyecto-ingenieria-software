import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AdminBreadcrumb } from '../components/admin/admin-breadcrumb';

afterEach(cleanup);

describe('AdminBreadcrumb — «Sección > Página», sin Dashboard', () => {
  it('con vista de entrada, la sección es un enlace y la página queda como actual', () => {
    render(<AdminBreadcrumb seccion="Proyectos" seccionHref="/dashboard/admin/proyectos?grupo=activos" pagina="Revisiones" />);
    const miga = within(screen.getByRole('navigation', { name: /breadcrumb/i }));

    expect(miga.getByRole('link', { name: 'Proyectos' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos?grupo=activos',
    );
    expect(miga.getByText('Revisiones')).toHaveAttribute('aria-current', 'page');
    expect(miga.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Proyectos', 'Revisiones']);
    expect(miga.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('una sección sin vista propia (Usuarios) se muestra como texto, no como enlace al panel', () => {
    render(<AdminBreadcrumb seccion="Usuarios" pagina="Gestión de Usuarios" />);
    const miga = within(screen.getByRole('navigation', { name: /breadcrumb/i }));

    expect(miga.getByText('Usuarios')).toBeInTheDocument();
    // La página actual se anuncia como enlace deshabilitado; no hay ningún `<a>` navegable.
    expect(screen.getByRole('navigation', { name: /breadcrumb/i }).querySelector('a')).toBeNull();
    expect(miga.getByText('Gestión de Usuarios')).toHaveAttribute('aria-current', 'page');
  });
});

describe('AdminBreadcrumb — estados accesibles (T-319, FG06-C03)', () => {
  it('es una navegación con nombre; la página actual lleva aria-current y no es un enlace', () => {
    render(<AdminBreadcrumb seccion="Verificación y seguridad" pagina="Eventos de seguridad" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const actual = within(nav).getByText('Eventos de seguridad');
    expect(actual).toHaveAttribute('aria-current', 'page');
    expect(actual.tagName).not.toBe('A');
    expect(within(nav).getAllByRole('listitem')).toHaveLength(2);
  });

  it('el enlace de sección es un <a> enfocable con el teclado y no anula el contorno de foco', () => {
    render(<AdminBreadcrumb seccion="Proyectos" seccionHref="/dashboard/admin/proyectos?grupo=activos" pagina="Activos" />);
    const enlace = screen.getByRole('link', { name: 'Proyectos' });
    enlace.focus();
    expect(enlace).toHaveFocus();
    expect(enlace.tabIndex).toBe(0);
    expect(enlace.className).not.toMatch(/outline-none|focus:outline-0/);
  });

  it('el separador es decorativo: los lectores de pantalla no lo anuncian', () => {
    render(<AdminBreadcrumb seccion="Usuarios" pagina="Gestión de Usuarios" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const separadores = nav.querySelectorAll('[data-slot="breadcrumb-separator"]');
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('nombres largos pueden partirse sin desbordar: la lista permite salto de línea', () => {
    render(<AdminBreadcrumb seccion="Verificación y seguridad" pagina="Recuperación de contraseña de una cuenta con nombre largo" />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i }).querySelector('ol')).toHaveClass('flex-wrap');
  });
});
