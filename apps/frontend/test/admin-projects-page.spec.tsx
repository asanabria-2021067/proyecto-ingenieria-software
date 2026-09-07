import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const replaceMock = vi.hoisted(() => vi.fn());
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams('grupo=activos')));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock('../lib/services/admin-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-projects')>();
  return { ...actual, getAdminProjects: vi.fn(), getAdminProjectDetail: vi.fn() };
});

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn(),
    close: vi.fn(),
    __emit: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}
const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

import AdminProjectsClient, { accionHref } from '../app/dashboard/admin/proyectos/admin-projects-client';
import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import { getAdminProjects } from '../lib/services/admin-projects';
import { adminProjectsPrefix, adminProjectsQueryKey } from '../lib/query-keys/admin-projects';
import { ADMIN_PROJECT_GROUPS, type AdminProjectListItem, type AdminProjectsPage } from '../lib/types/admin-projects';

function item(overrides: Partial<AdminProjectListItem> = {}): AdminProjectListItem {
  return {
    idProyecto: 37,
    tituloProyecto: 'Plataforma de Seguimiento de Laboratorios',
    estadoProyecto: 'EN_PROGRESO',
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    usuariosActivos: 8,
    sprintAmbiente: { idSprint: 6, numero: 6, estado: 'ACTIVO' },
    accion: 'MONITOREAR',
    ...overrides,
  };
}

function pagina(items: AdminProjectListItem[], overrides: Partial<AdminProjectsPage> = {}): AdminProjectsPage {
  return { items, total: items.length, page: 1, limit: 20, ...overrides };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderPage() {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(createElement(AdminProjectsClient), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos'));
  (getAdminProjects as any).mockResolvedValue(pagina([item()]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-15 — bandeja administrativa por grupo (F012)', () => {
  it('cada pestaña pide su grupo exacto y el grupo vive en la URL', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=cierres&page=2'));
    (getAdminProjects as any).mockResolvedValue(pagina([item({ accion: 'REVISAR_CIERRE', estadoProyecto: 'EN_SOLICITUD_CIERRE' })], { total: 25, page: 2 }));
    renderPage();

    await waitFor(() => expect(getAdminProjects).toHaveBeenCalledWith({ grupo: 'cierres', page: 2, limit: 20 }));
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /Solicitudes de cierre/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: /Solicitudes de cierre/ })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cierres');
    expect(within(tabs).getAllByRole('tab')).toHaveLength(4);
    expect(within(tabs).getByRole('tab', { name: /^Activos/ })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=activos');
    expect(within(tabs).getByRole('tab', { name: /^En revisión/ })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=revision');
    expect(within(tabs).getByRole('tab', { name: /^Cerrados/ })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cerrados');
    expect(ADMIN_PROJECT_GROUPS).toEqual(['activos', 'revision', 'cierres', 'cerrados']);
  });

  it('un grupo inválido en la URL redirige a ?grupo=activos', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=todos'));
    renderPage();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/admin/proyectos?grupo=activos'));
  });

  it('renderiza proyecto, líder, usuarios activos (sin recalcular), Sprint ambiente y acción sugerida', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Plataforma de Seguimiento de Laboratorios' })).toHaveAttribute('href', '/dashboard/admin/proyectos/37');
    expect(screen.getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Sprint 6')).toBeInTheDocument();
    expect(screen.getByText('Monitorear')).toBeInTheDocument();
  });

  it('sprintAmbiente: null renderiza «—»', async () => {
    (getAdminProjects as any).mockResolvedValue(pagina([item({ sprintAmbiente: null })]));
    renderPage();

    expect(await screen.findByLabelText('Sin Sprint operable')).toHaveTextContent('—');
  });

  it('no ofrece ninguna acción de escritura sobre el Sprint', async () => {
    renderPage();
    await screen.findByText('Sprint 6');

    expect(screen.queryByRole('button', { name: /finalizar|cerrar sprint|iniciar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /finalizar|cerrar sprint|iniciar/i })).not.toBeInTheDocument();
    const links = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(links.some((h) => h?.includes('/sprints/'))).toBe(false);
  });

  it('accionHref enruta por la acción sugerida sin habilitar escrituras', () => {
    expect(accionHref(item({ accion: 'REVISAR_CIERRE' }))).toBe('/dashboard/admin/proyectos/37/cierre');
    expect(accionHref(item({ accion: 'REVISAR_PUBLICACION' }))).toBe('/dashboard/projects/admin/reviews');
    expect(accionHref(item({ accion: 'CONSULTAR_HISTORICO' }))).toBe('/dashboard/admin/proyectos/37');
  });

  it('la paginación respeta limit y nunca supera 50', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos&page=1&limit=500'));
    (getAdminProjects as any).mockResolvedValue(pagina([item()], { total: 120, limit: 50 }));
    renderPage();

    await waitFor(() => expect(getAdminProjects).toHaveBeenCalledWith({ grupo: 'activos', page: 1, limit: 50 }));
    expect(await screen.findByText(/Página 1 de 3/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Página siguiente' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=activos&page=2&limit=50');
    expect(adminProjectsQueryKey('activos', 1, 50)).toEqual(['admin', 'proyectos', 'activos', 1, 50]);
  });

  it('un grupo vacío muestra su Empty específico', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=revision'));
    (getAdminProjects as any).mockResolvedValue(pagina([]));
    renderPage();

    expect(await screen.findByText('No hay proyectos en revisión.')).toBeInTheDocument();
  });
});

describe('useRealtimeNotifications — PROJECT_STATE_CHANGED invalida la bandeja administrativa', () => {
  it('invalida el prefijo [admin, proyectos] con cualquier grupo/página', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('PROJECT_STATE_CHANGED', { projectId: 37, estadoProyecto: 'EN_SOLICITUD_CIERRE' });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminProjectsPrefix }));
    expect(adminProjectsQueryKey('cierres', 1, 20).slice(0, 2)).toEqual([...adminProjectsPrefix]);
  });

  it('CLOSURE_REVIEW_UPDATED también invalida el prefijo', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('CLOSURE_REVIEW_UPDATED', { projectId: 37, revisionId: 5 });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminProjectsPrefix }));
  });
});
