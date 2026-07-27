import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// El tablero y los hitos viven ahora en el workspace Kanban (Sección 19),
// separados de la vista de detalle. Estas pruebas — antes en
// project-detail-task-tabs.spec.ts — verifican esa integración sobre
// KanbanWorkspaceClient, que consume las mismas queries canónicas.

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

// Fuera de un app router real `useSearchParams()` devuelve null; se simula con
// parámetros vacíos para no arrastrar el router completo.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
  // Deliberadamente distinto de useProjectTasks: demuestra que el workspace no
  // usa proyecto.tareas.
  tareas: [{ idTarea: 999, idHito: null, tituloTarea: 'TAREA-DTO-EMBEBIDA', descripcionTarea: null, estadoTarea: 'POR_HACER', prioridad: 'MEDIA', fechaLimite: null }],
};

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 42,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea del hook canónico',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
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

function mockUseProjectTasks(overrides: Partial<ReturnType<typeof useProjectTasks>> = {}) {
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

function mockUseProjectLabels(overrides: Record<string, unknown> = {}) {
  (useProjectLabels as any).mockReturnValue({
    labels: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createLabel: mutationStub(),
    updateLabel: mutationStub(),
    deleteLabel: mutationStub(),
    ...overrides,
  });
}

function mockUseProjectMembers(overrides: Record<string, unknown> = {}) {
  (useProjectMembers as any).mockReturnValue({
    members: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(KanbanWorkspaceClient, { id: 42 }),
    ),
  );
}

describe('KanbanWorkspaceClient — Tablero/Hitos (Sección 19/29)', () => {
  beforeEach(() => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    mockUseProjectLabels();
    mockUseProjectMembers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra las pestañas Tablero e Hitos, el título y el encabezado del workspace', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    renderWorkspace();

    expect(screen.getByRole('tab', { name: 'Tablero' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Hitos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Workspace del proyecto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
  });

  it('el breadcrumb enlaza a Mis proyectos y al detalle real; muestra estado/tipo/modalidad', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    renderWorkspace();

    expect(screen.getByRole('link', { name: 'Mis proyectos' })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine',
    );
    expect(screen.getByRole('link', { name: 'Proyecto de prueba' })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
    // Badges reales del proyecto con etiqueta humana (Sección 12).
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByText('INVESTIGACION')).toBeInTheDocument();
    expect(screen.getByText('HIBRIDO')).toBeInTheDocument();
  });

  it('llama useProjectTasks con el idProyecto numérico y no usa proyecto.tareas', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 1, tituloTarea: 'Tarea del hook canónico' })] });

    renderWorkspace();

    expect(useProjectTasks).toHaveBeenCalledWith(42);
    expect(useProjectTasks).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('TAREA-DTO-EMBEBIDA')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Hitos' }));
    expect(screen.getByText('Tarea del hook canónico')).toBeInTheDocument();
  });

  it('el Tablero muestra el loading mientras useProjectTasks está cargando', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ isLoading: true });

    const { container } = renderWorkspace();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('el Tablero muestra error con acción de reintentar que llama a refetch', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const refetch = vi.fn();
    mockUseProjectTasks({ isError: true, error: new Error('fallo'), refetch });

    renderWorkspace();

    expect(screen.getByText(/no se pudieron cargar las tareas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('proyecto sin tareas muestra el estado vacío del tablero (Sección 47)', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ tasks: [] });

    renderWorkspace();

    expect(screen.getByText('Aún no hay tareas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();
  });

  it('con tareas renderiza las cuatro columnas del Kanban', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Tarea 1', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Tarea 2', estadoTarea: 'HECHO' }),
      ],
    });

    renderWorkspace();

    for (const titulo of ['Por hacer', 'En progreso', 'En revisión', 'Hecho']) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getByText('Tarea 1')).toBeInTheDocument();
    expect(screen.getByText('Tarea 2')).toBeInTheDocument();
  });

  it('el líder ve "Nueva tarea" y "Gestionar etiquetas"; un tercero no', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    const { unmount } = renderWorkspace();
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gestionar etiquetas/i })).toBeInTheDocument();
    unmount();

    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    renderWorkspace();
    expect(screen.queryByRole('button', { name: /nueva tarea/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gestionar etiquetas/i })).not.toBeInTheDocument();
  });

  it('muestra un chip por cada rol activo del usuario (varios badges, Sección 28)', () => {
    const proyectoConRoles = {
      ...proyectoFixture,
      roles: [
        { idRolProyecto: 1, nombreRol: 'Frontend', cupos: 2, descripcionRolProyecto: null, requisitos: [] },
        { idRolProyecto: 2, nombreRol: 'Documentación', cupos: 2, descripcionRolProyecto: null, requisitos: [] },
      ],
    };
    (useProjectDetail as any).mockReturnValue({ data: proyectoConRoles, isLoading: false, error: null });
    mockUseProjectTasks();
    // El usuario 1 participa en ambos roles (dos filas de participación).
    (useProjectMembers as any).mockReturnValue({
      members: [
        { idUsuario: 1, idRolProyecto: 1, nombre: 'Ana', apellido: 'Uno', correo: 'a@x.com', fotoUrl: null },
        { idUsuario: 1, idRolProyecto: 2, nombre: 'Ana', apellido: 'Uno', correo: 'a@x.com', fotoUrl: null },
      ],
    });

    renderWorkspace();

    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Documentación')).toBeInTheDocument();
  });

  it('el encabezado muestra el progreso de tareas con leyenda de cuatro estados, incluida En revisión (Sección 14)', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({
      tasks: [
        tarea({ idTarea: 1, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, estadoTarea: 'EN_PROGRESO' }),
        tarea({ idTarea: 3, estadoTarea: 'EN_REVISION' }),
        tarea({ idTarea: 4, estadoTarea: 'HECHO' }),
      ],
    });

    renderWorkspace();

    expect(screen.getByText('Progreso de tareas')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('1 de 4 tareas completadas')).toBeInTheDocument();
    // "En revisión" aparece tanto en el encabezado de columna como en la
    // leyenda del progreso: la leyenda ya no lo omite (Sección 14).
    expect(screen.getAllByText(/En revisión/).length).toBeGreaterThanOrEqual(2);
    // Sin avance del backend, no se muestra el bloque de hitos.
    expect(screen.queryByText('Progreso de hitos')).not.toBeInTheDocument();
  });

  it('usa una sola consulta de detalle del proyecto para el encabezado, roles e hitos', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    renderWorkspace();

    expect(useProjectDetail).toHaveBeenCalledTimes(1);
    expect(useProjectDetail).toHaveBeenCalledWith(42);
  });
});
