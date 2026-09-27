import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// HU-154 (T-215): por debajo de lg la sidebar del proyecto no se muestra y
// esta barra la sustituye. El Sheet debe ofrecer exactamente los destinos del
// modelo compartido (los mismos que la sidebar de escritorio) y cerrarse al
// navegar.

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const pathnameMock = vi.fn(() => '/dashboard/projects/42');
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('@/hooks/use-exit-request', () => ({ useCurrentExitRequest: vi.fn(() => ({ request: null })) }));
vi.mock('@/components/projects/leave-project-modal', () => ({ LeaveProjectModal: () => null }));

import { ProjectMobileNav } from '@/components/projects/navigation/project-mobile-nav';
import {
  buildProjectNavGroups,
  flattenNavItems,
  type ProjectNavActor,
} from '@/components/projects/navigation/project-nav-model';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';

const ESCENARIOS: Record<ProjectNavActor, { userId: number; members: { idUsuario: number }[] }> = {
  leader: { userId: 1, members: [] },
  participant: { userId: 2, members: [{ idUsuario: 2 }] },
  visitor: { userId: 9, members: [] },
};

function mockActor(actor: ProjectNavActor, estadoProyecto = 'EN_PROGRESO') {
  const { userId, members } = ESCENARIOS[actor];
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: userId } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', estadoProyecto, creador: { idUsuario: 1 } },
  });
  (useProjectMembers as any).mockReturnValue({ members });
}

function destinosEsperados(actor: ProjectNavActor) {
  return flattenNavItems(
    buildProjectNavGroups({ idProyecto: 42, actor, estadoProyecto: 'EN_PROGRESO', tieneSolicitudSalida: false }),
  ).map((item) => [item.label, item.href]);
}

function renderNav() {
  return render(createElement(ProjectMobileNav, { idProyecto: 42 }));
}

function abrirSecciones() {
  fireEvent.click(screen.getByRole('button', { name: 'Secciones' }));
  return screen.getByRole('dialog', { name: 'Proyecto de prueba' });
}

describe('ProjectMobileNav', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/dashboard/projects/42');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('solo se muestra por debajo de lg y anuncia que abre un diálogo', () => {
    mockActor('leader');
    const { container } = renderNav();

    expect(container.firstElementChild).toHaveClass('lg:hidden');
    const secciones = screen.getByRole('button', { name: 'Secciones' });
    expect(secciones).toHaveAttribute('aria-haspopup', 'dialog');
    expect(secciones).toHaveAttribute('aria-expanded', 'false');
  });

  it.each(['leader', 'participant'] as const)(
    '%s: «Secciones» abre un Sheet con exactamente los destinos del modelo',
    (actor) => {
      mockActor(actor);
      renderNav();

      const sheet = abrirSecciones();
      // Con el Sheet modal abierto, Radix oculta el resto de la página a la
      // tecnología asistiva: el disparador solo se alcanza con hidden: true.
      expect(screen.getByRole('button', { name: 'Secciones', hidden: true })).toHaveAttribute('aria-expanded', 'true');
      const enlaces = within(sheet)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);
      expect(enlaces).toEqual(destinosEsperados(actor));
    },
  );

  it('el Sheet muestra los encabezados de grupo, el chip de actor y el destino activo', () => {
    mockActor('leader');
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban');
    renderNav();

    const sheet = abrirSecciones();
    expect(within(sheet).getByRole('group', { name: 'Trabajo' })).toBeInTheDocument();
    expect(within(sheet).getByText('Líder')).toHaveClass('pill');
    expect(within(sheet).getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page');
  });

  it('elegir un destino cierra el Sheet', async () => {
    mockActor('participant');
    renderNav();

    const sheet = abrirSecciones();
    // jsdom no implementa la navegación de documentos: se cancela la del
    // enlace; el onClick del destino (que cierra el Sheet) se ejecuta igual.
    const sinNavegar = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('click', sinNavegar);
    try {
      fireEvent.click(within(sheet).getByRole('link', { name: 'Bitácora' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    } finally {
      window.removeEventListener('click', sinNavegar);
    }
  });

  it('un cambio de ruta (p. ej. volver atrás) cierra el Sheet', async () => {
    mockActor('leader');
    const { rerender } = renderNav();
    abrirSecciones();

    pathnameMock.mockReturnValue('/dashboard/proyectos/42/miembros');
    rerender(createElement(ProjectMobileNav, { idProyecto: 42 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('el botón de cierre del Sheet también lo cierra', async () => {
    mockActor('leader');
    renderNav();
    abrirSecciones();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar secciones' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['leader', 'participant'] as const)('%s: la barra ofrece el menú «Acciones»', (actor) => {
    mockActor(actor);
    renderNav();

    expect(screen.getByRole('button', { name: 'Acciones del proyecto' })).toHaveTextContent('Acciones');
  });

  it('un visitante (solo «Resumen», sin acciones) no ve la barra', () => {
    mockActor('visitor', 'PUBLICADO');
    const { container } = renderNav();

    expect(container).toBeEmptyDOMElement();
  });
});
