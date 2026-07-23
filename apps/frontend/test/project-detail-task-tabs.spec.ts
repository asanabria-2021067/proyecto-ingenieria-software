import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// DashboardLayout es chrome (sidebar/topbar/websocket) ajeno al objeto
// principal de esta prueba (la integración Tablero/Hitos); se stubea como
// passthrough para no arrastrar next/navigation, sockets ni next/image.
vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

vi.mock('../hooks/use-project-detail', () => ({
  useProjectDetail: vi.fn(),
}));

vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));

vi.mock('../hooks/use-project-tasks', () => ({
  useProjectTasks: vi.fn(),
}));

vi.mock('../hooks/use-project-labels', () => ({
  useProjectLabels: vi.fn(),
}));

vi.mock('../hooks/use-project-members', () => ({
  useProjectMembers: vi.fn(),
}));

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
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
  // Deliberadamente distinto de lo que expone useProjectTasks, para
  // demostrar que la vista ya no usa proyecto.tareas.
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectDetailClient, { id: 42 }),
    ),
  );
}

describe('ProjectDetailClient — pestañas Tablero/Hitos (Tarea 36 + Tarea 37: Kanban + Tarea 38: formularios)', () => {
  beforeEach(() => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    mockUseProjectLabels();
    mockUseProjectMembers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra las pestañas Tablero e Hitos y conserva el encabezado principal', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    renderPage();

    expect(screen.getByRole('tab', { name: 'Tablero' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Hitos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Ana Lopez')).toBeInTheDocument();
  });

  it('llama useProjectTasks con el idProyecto numérico y no con proyecto.tareas', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ tasks: [tarea({ idTarea: 1, tituloTarea: 'Tarea del hook canónico' })] });

    renderPage();

    expect(useProjectTasks).toHaveBeenCalledWith(42);
    // TaskBoard recibe `tasks` como prop y nunca llama useProjectTasks por
    // su cuenta: una sola invocación para toda la vista (Tablero + Hitos).
    expect(useProjectTasks).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('TAREA-DTO-EMBEBIDA')).not.toBeInTheDocument();

    // Radix Tabs cambia de valor en `onMouseDown` (no en `click`); sin
    // `@testing-library/user-event` instalado, se dispara ese evento
    // directamente para no instalar dependencias nuevas.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Hitos' }));
    // Sin hitos cargados, HitosSection solo muestra "Tareas sin hito" con la
    // tarea proveniente de useProjectTasks, nunca la de proyecto.tareas.
    expect(screen.getByText('Tarea del hook canónico')).toBeInTheDocument();
  });

  it('Tablero muestra el loading mientras useProjectTasks está cargando', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ isLoading: true });

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('Tablero muestra error con acción de reintentar que llama a refetch', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const refetch = vi.fn();
    mockUseProjectTasks({ isError: true, error: new Error('fallo'), refetch });

    renderPage();

    expect(screen.getByText(/no se pudieron cargar las tareas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('Tablero muestra las cuatro columnas vacías cuando el proyecto no tiene tareas', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({ tasks: [] });

    renderPage();

    for (const titulo of ['Por hacer', 'En progreso', 'En revisión', 'Hecho']) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Sin tareas')).toHaveLength(4);
    expect(screen.queryByTestId('task-board-mount')).not.toBeInTheDocument();
  });

  it('TaskBoard reemplaza el placeholder task-board-mount con el Kanban real de cuatro columnas', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Tarea 1', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Tarea 2', estadoTarea: 'HECHO' }),
      ],
    });

    renderPage();

    expect(screen.queryByTestId('task-board-mount')).not.toBeInTheDocument();
    for (const titulo of ['Por hacer', 'En progreso', 'En revisión', 'Hecho']) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getByText('Tarea 1')).toBeInTheDocument();
    expect(screen.getByText('Tarea 2')).toBeInTheDocument();
  });

  it('el líder ve "Nueva tarea" y "Gestionar etiquetas"; un tercero no', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    const { unmount } = renderPage();
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gestionar etiquetas/i })).toBeInTheDocument();
    unmount();

    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    renderPage();
    expect(screen.queryByRole('button', { name: /nueva tarea/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gestionar etiquetas/i })).not.toBeInTheDocument();
  });

  it('no realiza una segunda consulta de detalle del proyecto para roles/hitos', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockUseProjectTasks();

    renderPage();

    // useProjectDetail ya se mockeó como vi.fn(): una sola vez para toda la vista.
    expect(useProjectDetail).toHaveBeenCalledTimes(1);
    expect(useProjectDetail).toHaveBeenCalledWith(42);
  });
});
