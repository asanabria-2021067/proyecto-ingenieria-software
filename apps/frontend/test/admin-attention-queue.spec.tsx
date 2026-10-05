import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AdminAttentionQueue } from '../components/admin/dashboard/attention-queue';

afterEach(cleanup);

function fila(clave: string): HTMLElement {
  const elemento = document.querySelector<HTMLElement>(`[data-fila="${clave}"]`);
  if (!elemento) throw new Error(`no existe la fila ${clave}`);
  return elemento;
}

describe('AdminAttentionQueue', () => {
  it('reúne en una sola cola los tres pendientes administrativos, con sus conteos', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);

    const cola = screen.getByRole('region', { name: 'Requieren atención' });
    expect(within(cola).getAllByRole('listitem')).toHaveLength(3);

    expect(within(fila('revision')).getByText('En revisión')).toBeInTheDocument();
    expect(within(fila('revision')).getByText('Proyectos pendientes de revisión')).toBeInTheDocument();
    expect(within(fila('revision')).getByText('7')).toBeInTheDocument();

    expect(within(fila('cierres')).getByText('Cierre pendiente')).toBeInTheDocument();
    expect(within(fila('cierres')).getByText('Solicitudes de cierre por aprobar')).toBeInTheDocument();
    expect(within(fila('cierres')).getByText('8')).toBeInTheDocument();

    expect(within(fila('bloqueados')).getByText('Bloqueados')).toBeInTheDocument();
    expect(within(fila('bloqueados')).getByText('Usuarios con acceso restringido')).toBeInTheDocument();
    expect(within(fila('bloqueados')).getByText('3')).toBeInTheDocument();
  });

  it('cada fila lleva a la bandeja donde se resuelve', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);

    expect(screen.getByRole('link', { name: 'Ver proyectos en revisión' })).toHaveAttribute(
      'href',
      '/dashboard/projects/admin/reviews',
    );
    expect(screen.getByRole('link', { name: 'Ver solicitudes de cierre pendientes' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos?grupo=cierres',
    );
    expect(screen.getByRole('link', { name: 'Ver gestión de usuarios' })).toHaveAttribute(
      'href',
      '/dashboard/admin/usuarios',
    );
  });

  it('resume el total pendiente en el encabezado', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    expect(screen.getByText('18 pendientes')).toBeInTheDocument();
  });

  it('usa el singular con un único pendiente', () => {
    render(<AdminAttentionQueue enRevision={0} cierrePendiente={1} usuariosBloqueados={0} />);
    expect(screen.getByText('1 pendiente')).toBeInTheDocument();
  });

  it('sin pendientes muestra «Todo al día», conserva las filas en cero y no pinta píldoras de acción', () => {
    render(<AdminAttentionQueue enRevision={0} cierrePendiente={0} usuariosBloqueados={0} />);

    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Acción requerida')).not.toBeInTheDocument();
    expect(screen.queryByText('Revisar')).not.toBeInTheDocument();
  });

  it('la píldora de acción aparece solo en las filas con algo pendiente', () => {
    render(<AdminAttentionQueue enRevision={2} cierrePendiente={0} usuariosBloqueados={1} />);

    expect(within(fila('revision')).getByText('Pendiente')).toBeInTheDocument();
    expect(within(fila('cierres')).queryByText('Acción requerida')).not.toBeInTheDocument();
    expect(within(fila('bloqueados')).getByText('Revisar')).toBeInTheDocument();
  });

  it('el rojo queda reservado a los bloqueados; revisión y cierres usan el acento de atención', () => {
    render(<AdminAttentionQueue enRevision={2} cierrePendiente={2} usuariosBloqueados={2} />);

    expect(within(fila('revision')).getByText('Pendiente').className).toContain('pill-warning');
    expect(within(fila('cierres')).getByText('Acción requerida').className).toContain('pill-warning');
    expect(within(fila('bloqueados')).getByText('Revisar').className).toContain('pill-error');
    // Ninguna fila se pinta entera de color: el tono vive en el icono y la píldora.
    for (const clave of ['revision', 'cierres', 'bloqueados']) {
      expect(fila(clave).className).not.toMatch(/bg-status-/);
    }
  });
});
