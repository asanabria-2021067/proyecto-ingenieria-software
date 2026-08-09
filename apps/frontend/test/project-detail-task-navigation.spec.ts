import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock('../hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));
vi.mock('../hooks/use-project-labels', () => ({ useProjectLabels: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));

// Estado mutable expuesto vía vi.hoisted: cada prueba fija los query params
// que "llegan" desde el enlace de una notificación antes de renderizar.
const searchParamsState = vi.hoisted(() => ({ current: new URLSearchParams() }));
const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.current,
  useRouter: () => routerMock,
}));

import KanbanWorkspaceClient from '../app/dashboard/projects/[id]/kanban/kanban-workspace-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectTasks } from '../hooks/use-project-tasks';
import { useProjectLabels } from '../hooks/use-project-labels';
import { useProjectMembers } from '../hooks/use-project-members';
import { useCurrentUser } from '../hooks/use-current-user';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 42,
  tituloProyecto: 'Proyecto de prueba',
  descripcionProyecto: null,
  objetivosProyecto: null,
  tipoProyecto: 'INVESTIGACION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'HIBRIDO',
  ubicacionProyecto: null,
  contextoAcademico: null,
  urlRecursoExterno: null,
  fechaPublicacion: null,
  fechaInicio: null,
  fechaFinEstimada: null,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [],
  hitos: [],
  tareas: [],
};

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 42,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

function mockUseProjectTasks(overrides: Record<string, unknown> = {}) {
  (useProjectTasks as any).mockReturnValue({
    tasks: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    crearTarea: mutationStub(),
    editarTarea: mutationStub(),
    cambiarEstadoTarea: mutationStub(),
    asignarTarea: mutationStub(),
    desasignarTarea: mutationStub(),
    eliminarTarea: mutationStub(),
    asociarEtiqueta: mutationStub(),
    retirarEtiqueta: mutationStub(),
    ...overrides,
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(KanbanWorkspaceClient, { id: 42 }),
    ),
  );
}

describe('KanbanWorkspaceClient — navegación desde notificaciones de tarea (Sección 18/20)', () => {
  beforeEach(() => {
    searchParamsState.current = new URLSearchParams();
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectLabels as any).mockReturnValue({
      labels: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      createLabel: mutationStub(),
      updateLabel: mutationStub(),
      deleteLabel: mutationStub(),
    });
    (useProjectMembers as any).mockReturnValue({ members: [] });
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    routerMock.replace.mockClear();
    routerMock.push.mockClear();
  });

  it('sin query params, la pestaña Tablero está activa por defecto', () => {
    mockUseProjectTasks();
    renderPage();
    expect(screen.getByRole('tab', { name: 'Tablero' })).toHaveAttribute('data-state', 'active');
  });

  it('?tab=hitos activa la pestaña Hitos al cargar', () => {
    searchParamsState.current = new URLSearchParams('tab=hitos');
    mockUseProjectTasks();
    renderPage();
    expect(screen.getByRole('tab', { name: 'Hitos' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Tablero' })).toHaveAttribute('data-state', 'inactive');
  });

  it('la navegación manual entre pestañas sigue funcionando con la URL fija', () => {
    mockUseProjectTasks();
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Hitos' }));
    expect(screen.getByRole('tab', { name: 'Hitos' })).toHaveAttribute('data-state', 'active');
  });

  it('la URL antigua ?taskId=<id> redirige a la ruta canónica /kanban/tasks/<id> (Sección 7)', () => {
    searchParamsState.current = new URLSearchParams('tab=tablero&taskId=7');
    mockUseProjectTasks({
      tasks: [tarea({ idTarea: 7, tituloTarea: 'Tarea enlazada', estadoTarea: 'EN_REVISION' })],
    });
    renderPage();

    expect(routerMock.replace).toHaveBeenCalledWith('/dashboard/projects/42/kanban/tasks/7');
  });

  it('la URL antigua con indicación de comentarios redirige con ?section=comments', () => {
    searchParamsState.current = new URLSearchParams('taskId=7&section=comments');
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 7 })] });
    renderPage();

    expect(routerMock.replace).toHaveBeenCalledWith(
      '/dashboard/projects/42/kanban/tasks/7?section=comments',
    );
  });

  it('redirige aunque el taskId no exista (la página dedicada resuelve el 404)', () => {
    searchParamsState.current = new URLSearchParams('taskId=555');
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 1 })] });
    renderPage();

    expect(routerMock.replace).toHaveBeenCalledWith('/dashboard/projects/42/kanban/tasks/555');
  });

  it('un taskId con formato inválido se ignora (no redirige)', () => {
    searchParamsState.current = new URLSearchParams('taskId=no-numerico');
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 1 })] });
    renderPage();

    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('no dispara una segunda consulta de tareas al resolver taskId', () => {
    searchParamsState.current = new URLSearchParams('taskId=1');
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 1 })] });
    renderPage();

    expect(useProjectTasks).toHaveBeenCalledTimes(1);
  });
});
