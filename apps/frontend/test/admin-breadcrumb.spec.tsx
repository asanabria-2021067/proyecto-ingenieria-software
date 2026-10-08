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

  it('una sección sin vista propia (Administración) se muestra como texto, no como enlace al panel', () => {
    render(<AdminBreadcrumb seccion="Administración" pagina="Gestión de Usuarios" />);
    const miga = within(screen.getByRole('navigation', { name: /breadcrumb/i }));

    expect(miga.getByText('Administración')).toBeInTheDocument();
    // La página actual se anuncia como enlace deshabilitado; no hay ningún `<a>` navegable.
    expect(screen.getByRole('navigation', { name: /breadcrumb/i }).querySelector('a')).toBeNull();
    expect(miga.getByText('Gestión de Usuarios')).toHaveAttribute('aria-current', 'page');
  });
});
