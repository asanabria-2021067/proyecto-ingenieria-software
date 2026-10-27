import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

/**
 * IESUC-568 (B1, NeuroLab): en el detalle de la tarea el cambio de estado y el
 * acceso al formulario de horas están en la cabecera, junto al título, con un
 * botón primario «Registrar horas». El permiso de registrar lo da el resumen
 * del backend (`puedeCrear`), no se infiere en el cliente.
 */

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
vi.mock('../components/projects/task-comments-panel', () => ({ TaskCommentsPanel: () => null }));
// La sección de horas tiene su propia cobertura; aquí basta su campo Horas con el id que recibe.
vi.mock('../components/hours/task-hours-section', () => ({
  TaskHoursSection: ({ idInputHoras }: { idInputHoras?: string }) =>
    createElement('input', { id: idInputHoras, 'aria-label': 'Horas' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../lib/mensajes', () => ({ confirmar: vi.fn(), aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-labels', () => ({ useProjectLabels: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-task-hours', () => ({ useTaskHours: vi.fn() }));

import TaskDetailClient from '../app/dashboard/projects/[id]/kanban/tasks/[taskId]/task-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectTasks } from '../hooks/use-project-tasks';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectLabels } from '../hooks/use-project-labels';
import { useCurrentUser } from '../hooks/use-current-user';
import { useTaskHours } from '../hooks/use-task-hours';

const LIDER = 1;
const INTEGRANTE = 2;

const proyecto = {
  idProyecto: 42,
  tituloProyecto: 'Proyecto de prueba',
  creador: { idUsuario: LIDER, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  roles: [],
  hitos: [],
} as unknown as ProyectoDetalleDTO;

const tareaAsignada = {
  idTarea: 5,
  idProyecto: 42,
  tituloTarea: 'Implementar login',
  descripcionTarea: null,
  estadoTarea: 'POR_HACER',
  prioridad: 'ALTA',
  fechaLimite: null,
  tiempoEstimadoHoras: null,
  rolProyecto: null,
  hito: null,
  etiquetas: [],
  cantidadComentarios: 0,
  asignacionActiva: {
    idAsignacion: 9,
    idUsuario: INTEGRANTE,
    usuario: { idUsuario: INTEGRANTE, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null },
  },
} as unknown as TareaPublicaDTO;

function mutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined, ...overrides };
}

function preparar({ usuario, puedeCrear }: { usuario: number; puedeCrear: boolean }) {
  const cambiarEstadoTarea = mutation();
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: usuario } });
  (useTaskHours as any).mockReturnValue({ resumen: { puedeCrear } });
  (useProjectTasks as any).mockReturnValue({
    tasks: [tareaAsignada],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    cambiarEstadoTarea,
    eliminarTarea: mutation(),
    crearTarea: mutation(),
    editarTarea: mutation(),
    asignarTarea: mutation(),
    desasignarTarea: mutation(),
    cerrarAsignacion: mutation(),
  });
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(TaskDetailClient, { idProyecto: 42, idTarea: 5 }),
    ),
  );
  return { cambiarEstadoTarea };
}

beforeEach(() => {
  (useProjectDetail as any).mockReturnValue({ data: proyecto, isLoading: false, isError: false, refetch: vi.fn() });
  (useProjectMembers as any).mockReturnValue({ members: [] });
  (useProjectLabels as any).mockReturnValue({
    labels: [], isLoading: false, isError: false, refetch: vi.fn(),
    createLabel: mutation(), updateLabel: mutation(), deleteLabel: mutation(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('IESUC-568 (B1): estado y horas junto al título', () => {
  it('quien tiene la tarea ve el estado y «Registrar horas» en la cabecera, antes del resto del detalle', () => {
    preparar({ usuario: INTEGRANTE, puedeCrear: true });

    const acciones = screen.getByRole('group', { name: 'Acciones de la tarea' });
    const estado = within(acciones).getByRole('combobox', { name: 'Cambiar estado de Implementar login' });
    const registrar = within(acciones).getByRole('button', { name: 'Registrar horas' });
    const titulo = screen.getByRole('heading', { level: 1, name: 'Implementar login' });
    const descripcion = screen.getByRole('heading', { name: 'Descripción' });

    // Orden en el documento: título → acciones → descripción (la primera sección del cuerpo).
    expect(titulo.compareDocumentPosition(acciones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(acciones.compareDocumentPosition(descripcion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(estado).toBeEnabled();
    expect(registrar).toHaveClass('bg-primary');
  });

  it('«Registrar horas» lleva el foco al campo Horas del formulario', () => {
    preparar({ usuario: INTEGRANTE, puedeCrear: true });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas' }));

    expect(screen.getByRole('textbox', { name: 'Horas' })).toHaveFocus();
  });

  it('pasar la tarea a «En progreso» desde la cabecera usa la mutación de estado', async () => {
    const { cambiarEstadoTarea } = preparar({ usuario: INTEGRANTE, puedeCrear: true });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Cambiar estado de Implementar login' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'En progreso' }));

    expect(cambiarEstadoTarea.mutate).toHaveBeenCalledWith({ taskId: 5, input: { estadoTarea: 'EN_PROGRESO' } });
  });

  it('el selector de estado aparece una sola vez (Organización solo informa el estado)', () => {
    preparar({ usuario: INTEGRANTE, puedeCrear: true });

    expect(screen.getAllByRole('combobox', { name: /Cambiar estado/ })).toHaveLength(1);
  });

  it('sin permiso del backend para registrar no se ofrece el botón', () => {
    preparar({ usuario: INTEGRANTE, puedeCrear: false });

    expect(screen.queryByRole('button', { name: 'Registrar horas' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Cambiar estado de Implementar login' })).toBeInTheDocument();
  });

  it('quien no es líder ni tiene la tarea no ve acciones', () => {
    preparar({ usuario: 77, puedeCrear: false });

    expect(screen.queryByRole('group', { name: 'Acciones de la tarea' })).not.toBeInTheDocument();
  });
});
