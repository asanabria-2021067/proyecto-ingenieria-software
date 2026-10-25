import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { InboxFoldersSidebar, type InboxFoldersSelection } from '../components/notifications/inbox-folders-sidebar';
import { INBOX_CATEGORIES } from '../lib/notifications/inbox-model';

/** Sprint 10 — sidebar secundaria de la bandeja (REGIÓN B). */

const base: InboxFoldersSelection = { bandeja: 'recibidas', categoria: null };

function renderSidebar(props: Partial<React.ComponentProps<typeof InboxFoldersSidebar>> = {}) {
  const onSeleccionar = vi.fn();
  const onToggleCollapsed = vi.fn();
  const utils = render(
    <InboxFoldersSidebar
      seleccion={base}
      onSeleccionar={onSeleccionar}
      conteos={{ noLeidas: 12, porCategoria: { tareas: 3, proyectos: 120 } }}
      collapsed={false}
      onToggleCollapsed={onToggleCollapsed}
      {...props}
    />,
  );
  return { onSeleccionar, onToggleCollapsed, ...utils };
}

afterEach(cleanup);

describe('InboxFoldersSidebar', () => {
  it('expandida: bandeja, categorías reales con sus contadores y la nota de privacidad', () => {
    renderSidebar();
    const aside = screen.getByRole('complementary', { name: 'Carpetas de notificaciones' });
    expect(aside).toHaveAttribute('data-state', 'expanded');
    expect(within(aside).getByRole('button', { name: 'Recibidas' })).toHaveAttribute('aria-current', 'true');
    const noLeidas = within(aside).getByRole('button', { name: 'No leídas, 12 sin leer' });
    expect(noLeidas).not.toHaveAttribute('aria-current');
    expect(noLeidas).toHaveTextContent('12');
    for (const categoria of INBOX_CATEGORIES) {
      expect(within(aside).getByRole('button', { name: new RegExp(`^${categoria.titulo}`) })).toBeInTheDocument();
    }
    expect(within(aside).getByRole('button', { name: 'Tareas e hitos, 3 sin leer' })).toHaveTextContent('3');
    expect(within(aside).getByRole('button', { name: 'Proyectos, 120 sin leer' })).toHaveTextContent('99+');
    expect(within(aside).getByText('Notificaciones privadas de tu cuenta')).toBeInTheDocument();
    expect(within(aside).getByRole('button', { name: 'Contraer carpetas de notificaciones' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('elegir una categoría la activa; repetirla la quita; No leídas cambia la bandeja', () => {
    const { onSeleccionar, rerender } = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Proyectos, 120 sin leer' }));
    expect(onSeleccionar).toHaveBeenLastCalledWith({ bandeja: 'recibidas', categoria: 'proyectos' });

    rerender(
      <InboxFoldersSidebar seleccion={{ bandeja: 'recibidas', categoria: 'proyectos' }} onSeleccionar={onSeleccionar} conteos={{}} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Proyectos' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Proyectos' }));
    expect(onSeleccionar).toHaveBeenLastCalledWith({ bandeja: 'recibidas', categoria: null });

    fireEvent.click(screen.getByRole('button', { name: 'No leídas' }));
    expect(onSeleccionar).toHaveBeenLastCalledWith({ bandeja: 'no-leidas', categoria: 'proyectos' });
  });

  it('contraída: solo iconos con nombre accesible, selección visible y botón para expandir', () => {
    const { onToggleCollapsed } = renderSidebar({ collapsed: true, seleccion: { bandeja: 'no-leidas', categoria: 'horas' } });
    const aside = screen.getByRole('complementary', { name: 'Carpetas de notificaciones' });
    expect(aside).toHaveAttribute('data-state', 'collapsed');
    expect(within(aside).queryByText('Recibidas')).not.toBeInTheDocument();
    expect(within(aside).getByRole('button', { name: 'No leídas, 12 sin leer' })).toHaveAttribute('aria-current', 'true');
    expect(within(aside).getByRole('button', { name: 'Horas y reconocimiento' })).toHaveAttribute('aria-current', 'true');
    expect(within(aside).getByLabelText('Notificaciones privadas de tu cuenta')).toBeInTheDocument();
    const expandir = within(aside).getByRole('button', { name: 'Expandir carpetas de notificaciones' });
    expect(expandir).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandir);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('sin función de alternar (rail forzado por el ancho) no ofrece el botón pero sigue navegando', () => {
    const { onSeleccionar } = renderSidebar({ collapsed: true, onToggleCollapsed: undefined });
    expect(screen.queryByRole('button', { name: /carpetas de notificaciones$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tareas e hitos, 3 sin leer' }));
    expect(onSeleccionar).toHaveBeenLastCalledWith({ bandeja: 'recibidas', categoria: 'tareas' });
  });
});
