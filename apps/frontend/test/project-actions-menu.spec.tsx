import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// HU-154 (T-215): las acciones secundarias viven en un solo menú, separado
// de la navegación. El modal de salida tiene su propio spec
// (leave-project-modal.spec.ts); aquí se sustituye por un doble que solo
// expone si está abierto y para qué proyecto, que es el contrato del menú.

vi.mock('@/components/projects/leave-project-modal', () => ({
  LeaveProjectModal: ({
    open,
    idProyecto,
    onOpenChange,
  }: {
    open: boolean;
    idProyecto: number;
    onOpenChange: (open: boolean) => void;
  }) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': `Salida del proyecto ${idProyecto}` },
          createElement('button', { type: 'button', onClick: () => onOpenChange(false) }, 'Cerrar modal'),
        )
      : null,
}));

import { ProjectActionsMenu } from '@/components/projects/navigation/project-actions-menu';
import { buildProjectActions, type ProjectNavContext } from '@/components/projects/navigation/project-nav-model';

function acciones(overrides: Partial<ProjectNavContext> = {}) {
  return buildProjectActions({
    idProyecto: 42,
    actor: 'leader',
    estadoProyecto: 'EN_PROGRESO',
    tieneSolicitudSalida: false,
    ...overrides,
  });
}

function renderMenu(overrides: Partial<ProjectNavContext> = {}, variant: 'icon' | 'labeled' = 'icon') {
  return render(createElement(ProjectActionsMenu, { idProyecto: 42, actions: acciones(overrides), variant }));
}

async function abrirMenu() {
  const trigger = screen.getByRole('button', { name: 'Acciones del proyecto' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

async function itemsDelMenu() {
  await abrirMenu();
  return screen.getAllByRole('menuitem').map((item) => ({
    texto: item.textContent,
    href: item.closest('a')?.getAttribute('href') ?? null,
  }));
}

describe('ProjectActionsMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('el disparador se anuncia como «Acciones del proyecto»', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Acciones del proyecto' })).toBeInTheDocument();
  });

  it('la variante móvil muestra el texto «Acciones» en el botón', () => {
    renderMenu({}, 'labeled');
    expect(screen.getByRole('button', { name: 'Acciones del proyecto' })).toHaveTextContent('Acciones');
  });

  it('líder con proyecto editable: tres enlaces exactos, en orden', async () => {
    renderMenu();
    expect(await itemsDelMenu()).toEqual([
      { texto: 'Editar información', href: '/dashboard/projects/mine/form?id=42' },
      { texto: 'Editar roles', href: '/dashboard/projects/42?openRoles=1' },
      { texto: 'Revisiones pasadas', href: '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42' },
    ]);
  });

  it.each(['EN_SOLICITUD_CIERRE', 'CERRADO'])('líder en %s: solo «Revisiones pasadas»', async (estado) => {
    renderMenu({ estadoProyecto: estado });
    expect(await itemsDelMenu()).toEqual([
      { texto: 'Revisiones pasadas', href: '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42' },
    ]);
  });

  it('participante con solicitud abierta: «Ver solicitud de salida» enlaza a su preparación', async () => {
    renderMenu({ actor: 'participant', tieneSolicitudSalida: true });
    expect(await itemsDelMenu()).toEqual([
      { texto: 'Ver solicitud de salida', href: '/dashboard/projects/42/salida/preparacion' },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('participante sin solicitud: «Solicitar salida» abre el modal del proyecto y este se puede cerrar', async () => {
    renderMenu({ actor: 'participant', tieneSolicitudSalida: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await abrirMenu();
    const item = screen.getByRole('menuitem', { name: 'Solicitar salida' });
    expect(item.closest('a')).toBeNull();
    fireEvent.click(item);

    const modal = await screen.findByRole('dialog', { name: 'Salida del proyecto 42' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }));
    await waitFor(() => expect(modal).not.toBeInTheDocument());
  });

  it('visitante (sin acciones): no se renderiza disparador ni modal', () => {
    const { container } = renderMenu({ actor: 'visitor' });
    expect(screen.queryByRole('button', { name: 'Acciones del proyecto' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('el líder nunca monta el modal de salida', async () => {
    renderMenu();
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: 'Solicitar salida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
