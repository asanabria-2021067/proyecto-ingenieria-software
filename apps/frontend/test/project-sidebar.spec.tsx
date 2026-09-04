import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// La sidebar del workspace de proyecto reemplazó a la navegación por tabs
// (commit 4f482be): debe exponer TODOS los destinos que antes vivían en la
// barra de pestañas (Resumen, Editar Información, Revisiones Pasadas, Editar
// Roles, Miembros, Sprints, Tablero) y marcar como activo únicamente el
// NavItem cuya ruta calza de forma más específica con la URL actual — un
// bug reportado hacía que, al entrar al tablero (ruta anidada bajo
// Resumen), "Resumen" y "Tablero" quedaran marcados activos a la vez.

const pathnameMock = vi.fn(() => '/dashboard/projects/42');
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('@/components/projects/project-chat-panel', () => ({
  ProjectChatPanel: () => null,
}));

import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';

function mockLeader() {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 } },
  });
  (useProjectMembers as any).mockReturnValue({ members: [] });
}

function mockParticipante() {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 2 } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 } },
  });
  (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2 }] });
}

function renderSidebar() {
  return render(createElement(ProjectSidebar, { idProyecto: 42 }));
}

describe('ProjectSidebar', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/dashboard/projects/42');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('el líder ve todos los destinos que antes exponía la barra de tabs', () => {
    mockLeader();
    renderSidebar();

    expect(screen.getByRole('link', { name: /resumen/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
    expect(screen.getByRole('link', { name: /editar información/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/form?id=42',
    );
    expect(screen.getByRole('link', { name: /revisiones pasadas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42',
    );
    expect(screen.getByRole('link', { name: /editar roles/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42?openRoles=1',
    );
    expect(screen.getByRole('link', { name: /miembros/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/miembros',
    );
    expect(screen.getByRole('link', { name: /sprints/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/sprints',
    );
    expect(screen.getByRole('link', { name: /tablero/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
    expect(screen.getByRole('link', { name: /lista de tareas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/tareas',
    );
  });

  it('al entrar al Tablero (ruta anidada bajo Resumen) solo un NavItem queda activo', () => {
    mockLeader();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban');
    renderSidebar();

    const activos = screen.getAllByRole('link').filter((link) => link.className.includes('text-primary'));
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAccessibleName(/tablero/i);
  });

  it('al entrar al detalle de una tarea del tablero solo "Tablero" queda activo', () => {
    mockLeader();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban/tasks/7');
    renderSidebar();

    const activos = screen.getAllByRole('link').filter((link) => link.className.includes('text-primary'));
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAccessibleName(/tablero/i);
  });

  it('un integrante (no líder) también ve "Lista de tareas", igual que "Tablero"', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lista de tareas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/tareas',
    );
    expect(screen.queryByRole('link', { name: /editar información/i })).not.toBeInTheDocument();
  });
});
