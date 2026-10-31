import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MyTasksCard } from '../components/projects/detail/my-tasks-card';
import type { TareaPublicaDTO } from '../lib/types/tasks';

function tarea(idTarea: number, titulo: string, idUsuario: number | null): TareaPublicaDTO {
  return {
    idTarea,
    idProyecto: 7,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: titulo,
    descripcionTarea: null,
    estadoTarea: 'EN_PROGRESO',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    puntosHistoria: null,
    asignacionActiva:
      idUsuario === null
        ? null
        : {
            idAsignacion: idTarea,
            idUsuario,
            fechaAsignacion: '2026-01-02T00:00:00.000Z',
            usuario: { idUsuario, nombre: 'A', apellido: 'B', fotoUrl: null },
          },
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
  };
}

const estado = vi.hoisted(() => ({
  tasks: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/use-project-tasks', () => ({ useProjectTasks: () => estado }));

describe('MyTasksCard (NL-T4)', () => {
  afterEach(() => {
    cleanup();
    estado.isLoading = false;
    estado.isError = false;
    estado.refetch.mockClear();
  });

  it('mientras carga muestra el estado de carga y no el vacío', () => {
    estado.tasks = [];
    estado.isLoading = true;
    render(<MyTasksCard idProyecto={7} idUsuario={5} />);
    expect(screen.getByText('Cargando tus tareas…')).toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes tareas asignadas en este proyecto.')).not.toBeInTheDocument();
  });

  it('si falla la carga muestra el error y «Reintentar» vuelve a pedir las tareas', () => {
    estado.tasks = [];
    estado.isError = true;
    render(<MyTasksCard idProyecto={7} idUsuario={5} />);
    expect(screen.getByText('No se pudieron cargar tus tareas.')).toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes tareas asignadas en este proyecto.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(estado.refetch).toHaveBeenCalledTimes(1);
  });

  it('lista solo mis tareas con su estado y un enlace para registrar horas', () => {
    estado.tasks = [tarea(1, 'Mía', 5), tarea(2, 'Ajena', 6), tarea(3, 'Sin asignar', null)];
    render(<MyTasksCard idProyecto={7} idUsuario={5} />);
    expect(screen.getByRole('heading', { name: 'Mis tareas en este proyecto' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mía' })).toHaveAttribute('href', '/dashboard/projects/7/kanban/tasks/1');
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar horas en "Mía"' })).toHaveAttribute(
      'href',
      '/dashboard/projects/7/kanban/tasks/1?section=hours',
    );
    expect(screen.queryByText('Ajena')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin asignar')).not.toBeInTheDocument();
  });

  it('sin tareas asignadas muestra un mensaje', () => {
    estado.tasks = [tarea(2, 'Ajena', 6)];
    render(<MyTasksCard idProyecto={7} idUsuario={5} />);
    expect(screen.getByText('Aún no tienes tareas asignadas en este proyecto.')).toBeInTheDocument();
  });
});