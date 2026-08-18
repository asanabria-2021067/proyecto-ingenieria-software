import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

let currentPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));

import {
  ProjectFinalizationBannerHost,
  resolveProjectScopedId,
} from '../components/projects/project-finalization-banner-host';
import { useProjectSprints } from '../hooks/use-project-sprints';

const TEXTO_BANNER =
  'Este proyecto está temporalmente bloqueado: se está finalizando el Sprint actual.';

function mockSprints(estado: string | null) {
  (useProjectSprints as any).mockReturnValue({
    sprints: estado ? [{ idSprint: 1, idProyecto: 1, numero: 1, estado }] : [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('resolveProjectScopedId — helper puro de scope', () => {
  it.each([
    ['/dashboard/proyectos/42', 42],
    ['/dashboard/proyectos/42/miembros', 42],
    ['/dashboard/proyectos/42/sprints/7', 42],
    ['/dashboard/proyectos/42/sprints/7/finalizar', 42],
    ['/dashboard/projects/42/kanban', 42],
    ['/dashboard/projects/mine/42', 42],
  ])('%s resuelve idProyecto=%s', (pathname, expected) => {
    expect(resolveProjectScopedId(pathname)).toBe(expected);
  });

  it.each([
    '/dashboard',
    '/dashboard/proyectos',
    '/dashboard/projects/mine',
    '/dashboard/projects/mine/form',
    '/dashboard/projects/admin',
    '/dashboard/projects/admin/reviews',
    '/dashboard/admin',
    '/dashboard/mis-tareas',
    '/dashboard/notificaciones',
  ])('%s no resuelve ningún proyecto (null)', (pathname) => {
    expect(resolveProjectScopedId(pathname)).toBeNull();
  });
});

describe('ProjectFinalizationBannerHost — scope real', () => {
  it('en una ruta de proyecto con Sprint EN_FINALIZACION, monta el banner', () => {
    currentPathname = '/dashboard/proyectos/42/miembros';
    mockSprints('EN_FINALIZACION');

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.getByText(TEXTO_BANNER)).toBeInTheDocument();
    expect(useProjectSprints).toHaveBeenCalledWith(42);
  });

  it('en /dashboard/projects/[id]/kanban también resuelve y monta el banner', () => {
    currentPathname = '/dashboard/projects/42/kanban';
    mockSprints('EN_FINALIZACION');

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.getByText(TEXTO_BANNER)).toBeInTheDocument();
    expect(useProjectSprints).toHaveBeenCalledWith(42);
  });

  it('en /dashboard/projects/mine/[id] también resuelve y monta el banner', () => {
    currentPathname = '/dashboard/projects/mine/42';
    mockSprints('EN_FINALIZACION');

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.getByText(TEXTO_BANNER)).toBeInTheDocument();
    expect(useProjectSprints).toHaveBeenCalledWith(42);
  });

  it('en una ruta no project-scoped (/dashboard), no monta ningún banner ni consulta ningún proyecto', () => {
    currentPathname = '/dashboard';

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
    expect(useProjectSprints).not.toHaveBeenCalled();
  });

  it('en /dashboard/projects/mine (bare, sin id) no monta banner', () => {
    currentPathname = '/dashboard/projects/mine';

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
    expect(useProjectSprints).not.toHaveBeenCalled();
  });

  it('en /dashboard/projects/admin no monta banner (no confunde "admin" con un id)', () => {
    currentPathname = '/dashboard/projects/admin';

    render(createElement(ProjectFinalizationBannerHost));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
    expect(useProjectSprints).not.toHaveBeenCalled();
  });
});
