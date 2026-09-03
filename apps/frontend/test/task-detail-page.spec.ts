import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
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

// El panel de comentarios se reutiliza tal cual (sus mutaciones/consulta ya
// están probadas aparte). Aquí se stubea para verificar que se renderiza JUNTO
// a los detalles, sin reimplementar su lógica ni arrastrar red.
vi.mock('../components/projects/task-comments-panel', () => ({
  TaskCommentsPanel: () => createElement('div', { 'data-testid': 'panel-comentarios' }, 'Comentarios'),
}));

// HU-142: mismo criterio que TaskCommentsPanel — su consulta/mutación ya
// tienen cobertura dedicada en task-hours-panel.spec.ts, así que aquí se
// stubea para verificar únicamente que se monta junto al resto del detalle.
vi.mock('../components/projects/task-hours-panel', () => ({
  TaskHoursPanel: () => createElement('div', { 'data-testid': 'panel-horas' }, 'Horas'),
}));

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const searchParamsState = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsState.current,
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-labels', () => ({ useProjectLabels: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));

import TaskDetailClient from '../app/dashboard/projects/[id]/kanban/tasks/[taskId]/task-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectTasks } from '../hooks/use-project-tasks';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectLabels } from '../hooks/use-project-labels';
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
  roles: [{ idRolProyecto: 3, nombreRol: 'Backend' } as any],
  hitos: [{ idHito: 8, tituloHito: 'Entrega 1' } as any],
  tareas: [],
};

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 5,
    idProyecto: 42,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Implementar login',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'ALTA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: '2027-01-01',
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 2,
    ...overrides,
  };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false, error: null, variables: undefined, ...overrides };
}

function mockTasks(overrides: Record<string, unknown> = {}) {
  (useProjectTasks as any).mockReturnValue({
    tasks: [tarea()],
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
    // F10: TaskDetailView ahora monta <CloseAssignmentForm> (Kanban normal),
    // que llama useProjectTasks(idProyecto) internamente y necesita
    // `cerrarAsignacion`. Su comportamiento propio ya tiene cobertura
    // dedicada en close-assignment-form.spec.ts; aquí solo evita el crash.
    cerrarAsignacion: mutationStub(),
    eliminarTarea: mutationStub(),
    asociarEtiqueta: mutationStub(),
    retirarEtiqueta: mutationStub(),
    ...overrides,
  });
}

function renderDetail(idTarea = 5) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TaskDetailClient, { idProyecto: 42, idTarea }),
    ),
  );
}

beforeEach(() => {
  searchParamsState.current = new URLSearchParams();
  (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, isError: false, refetch: vi.fn() });
  (useProjectMembers as any).mockReturnValue({ members: [] });
  (useProjectLabels as any).mockReturnValue({
    labels: [], isLoading: false, isError: false, refetch: vi.fn(),
    createLabel: mutationStub(), updateLabel: mutationStub(), deleteLabel: mutationStub(),
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
  mockTasks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TaskDetailPage — información y layout', () => {
  it('renderiza título (h1), descripción, badges humanos y comentarios simultáneamente', () => {
    mockTasks({
      tasks: [
        tarea({
          descripcionTarea: 'Detalle de la tarea',
          rolProyecto: { idRolProyecto: 3, nombreRol: 'Backend' },
          hito: { idHito: 8, tituloHito: 'Entrega 1' },
          tiempoEstimadoHoras: 4,
          etiquetas: [{ idEtiqueta: 1, nombreEtiqueta: 'Urgente', color: '#FF0000', nombreNormalizado: '' }],
          asignacionActiva: {
            idAsignacion: 1, idUsuario: 5, fechaAsignacion: '2026-01-01T00:00:00.000Z',
            usuario: { idUsuario: 5, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null },
          },
        }),
      ],
    });
    renderDetail();

    expect(screen.getByRole('heading', { level: 1, name: 'Implementar login' })).toBeInTheDocument();
    expect(screen.getByText('Detalle de la tarea')).toBeInTheDocument();
    // Estado/prioridad humanos, nunca el enum interno.
    expect(screen.getAllByText('Por hacer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alta').length).toBeGreaterThan(0);
    expect(screen.queryByText('POR_HACER')).not.toBeInTheDocument();
    // Rol, asignado, hito, tiempo, etiqueta.
    expect(screen.getAllByText('Backend').length).toBeGreaterThan(0);
    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getAllByText('Entrega 1').length).toBeGreaterThan(0);
    expect(screen.getByText('4 horas')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    // Detalles y comentarios visibles a la vez (sin pestañas).
    expect(screen.getByTestId('panel-comentarios')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Comentarios \(2\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Detalles' })).not.toBeInTheDocument();
  });

  it('muestra los estados vacíos (sin descripción, rol, asignado, hito, etiquetas)', () => {
    renderDetail();
    expect(screen.getByText('Esta tarea no tiene una descripción.')).toBeInTheDocument();
    expect(screen.getByText('Sin rol')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('Sin hito')).toBeInTheDocument();
    expect(screen.getByText('Esta tarea no tiene etiquetas.')).toBeInTheDocument();
    expect(screen.getByText('No estimado')).toBeInTheDocument();
  });

  it('muestra el breadcrumb con el título de la tarea, sin IDs', () => {
    renderDetail();
    expect(screen.getByText('Mis proyectos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kanban' })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
  });

  it('tarea inexistente muestra "Tarea no encontrada" con vuelta al tablero', () => {
    mockTasks({ tasks: [tarea({ idTarea: 999 })] });
    renderDetail(5);
    expect(screen.getByRole('heading', { name: 'Tarea no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al tablero' })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
  });
});

describe('TaskDetailPage — acciones y permisos', () => {
  it('"Volver al tablero" cae al workspace Kanban cuando no hay historial previo', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al tablero' }));
    // En jsdom history.length === 1 (sin historial): se usa el fallback push.
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard/projects/42/kanban');
  });

  it('el líder cambia el estado reutilizando la mutation de estado', async () => {
    const mutate = vi.fn();
    mockTasks({ cambiarEstadoTarea: mutationStub({ mutate }) });
    renderDetail();

    const select = screen.getByRole('combobox', { name: 'Cambiar estado de Implementar login' });
    fireEvent.keyDown(select, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'En progreso' }));

    expect(mutate).toHaveBeenCalledWith({ taskId: 5, input: { estadoTarea: 'EN_PROGRESO' } });
  });

  it('"Editar tarea" abre el formulario compartido sin salir de la ruta', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarea Implementar login' }));
    expect(screen.getByText('Actualiza la información de la tarea. Los cambios se reflejarán en el tablero.')).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('Desasignar (con asignación activa) reutiliza la mutation de desasignar', async () => {
    const mutate = vi.fn();
    mockTasks({
      desasignarTarea: mutationStub({ mutate }),
      tasks: [
        tarea({
          asignacionActiva: {
            idAsignacion: 1, idUsuario: 5, fechaAsignacion: '2026-01-01T00:00:00.000Z',
            usuario: { idUsuario: 5, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null },
          },
        }),
      ],
    });
    renderDetail();

    const mas = screen.getByRole('button', { name: 'Más acciones de la tarea' });
    mas.focus();
    fireEvent.keyDown(mas, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Desasignar tarea Implementar login' }));
    expect(mutate).toHaveBeenCalledWith({ taskId: 5 });
  });

  // F10 — entry point del Kanban normal: reutiliza el mismo CloseAssignmentForm que F9.
  it('el asignado activo ve "Cerrar tramo" y abre el mismo formulario compartido con los ids correctos', async () => {
    mockTasks({
      tasks: [
        tarea({
          asignacionActiva: {
            idAsignacion: 77,
            idUsuario: 1,
            fechaAsignacion: '2026-01-01T00:00:00.000Z',
            usuario: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
          },
        }),
      ],
    });
    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo de Implementar login' }));

    expect(await screen.findByRole('heading', { name: 'Cerrar tramo' })).toBeInTheDocument();
  });

  it('un usuario sin asignación activa no ve "Cerrar tramo"', () => {
    mockTasks({ tasks: [tarea({ asignacionActiva: null })] });
    renderDetail();

    expect(screen.queryByRole('button', { name: /Cerrar tramo/ })).not.toBeInTheDocument();
  });

  it('eliminar tarea confirma, llama a la mutation y vuelve al tablero', async () => {
    const mutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    mockTasks({ eliminarTarea: mutationStub({ mutate }) });
    renderDetail();

    const mas = screen.getByRole('button', { name: 'Más acciones de la tarea' });
    mas.focus();
    fireEvent.keyDown(mas, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar tarea Implementar login' }));
    expect(await screen.findByText('¿Eliminar esta tarea?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar tarea' }));
    expect(mutate).toHaveBeenCalledWith({ taskId: 5 }, expect.anything());
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/dashboard/projects/42/kanban'));
  });

  it('un usuario sin permiso no ve Editar ni Más, ni el selector de estado', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    renderDetail();
    expect(screen.queryByRole('button', { name: /^Editar tarea/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Más acciones de la tarea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Cambiar estado/ })).not.toBeInTheDocument();
    // Aun así ve la información y los comentarios.
    expect(screen.getByRole('heading', { level: 1, name: 'Implementar login' })).toBeInTheDocument();
    expect(screen.getByTestId('panel-comentarios')).toBeInTheDocument();
  });
});
