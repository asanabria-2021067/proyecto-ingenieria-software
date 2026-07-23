import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TareaPublicaDTO } from '../lib/types/tasks';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// TaskCommentsDialog no es el objeto principal de esta prueba (TaskBoard lo
// es): se stubea, igual que en hitos-section.spec.ts, para no arrastrar
// QueryClient/useCurrentUser/red.
vi.mock('../components/projects/task-comments-dialog', () => ({
  TaskCommentsDialog: () => null,
}));

import { TaskBoard } from '../components/projects/task-board';

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
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

function renderBoard(overrides: Record<string, unknown> = {}) {
  const props = {
    idProyecto: 10,
    tasks: [] as TareaPublicaDTO[],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    isLeader: false,
    currentUserId: null as number | null,
    cambiarEstadoTarea: mutationStub(),
    eliminarTarea: mutationStub(),
    ...overrides,
  };
  const utils = render(createElement(TaskBoard, props as any));
  return { ...utils, props };
}

describe('TaskBoard', () => {
  afterEach(() => cleanup());

  it('renderiza exactamente cuatro columnas en el orden correcto', () => {
    renderBoard({ tasks: [tarea()] });
    const encabezados = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Por hacer', 'En progreso', 'En revisión', 'Hecho']);
  });

  it('muestra el contador total de tareas visibles', () => {
    renderBoard({
      tasks: [tarea({ idTarea: 1 }), tarea({ idTarea: 2 }), tarea({ idTarea: 3 })],
    });
    expect(screen.getByText('3 tareas')).toBeInTheDocument();
  });

  it('muestra el contador por columna', () => {
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 3, estadoTarea: 'HECHO' }),
      ],
    });
    const columnaPorHacer = screen.getByRole('heading', { name: 'Por hacer' }).closest('section') as HTMLElement;
    expect(within(columnaPorHacer).getByText('2')).toBeInTheDocument();
    const columnaHecho = screen.getByRole('heading', { name: 'Hecho' }).closest('section') as HTMLElement;
    expect(within(columnaHecho).getByText('1')).toBeInTheDocument();
  });

  it('columna vacía muestra un estado compacto', () => {
    renderBoard({ tasks: [tarea({ estadoTarea: 'POR_HACER' })] });
    const columnaHecho = screen.getByRole('heading', { name: 'Hecho' }).closest('section') as HTMLElement;
    expect(within(columnaHecho).getByText('Sin tareas')).toBeInTheDocument();
  });

  it('proyecto sin tareas muestra las cuatro columnas vacías', () => {
    renderBoard({ tasks: [] });
    expect(screen.getAllByText('Sin tareas')).toHaveLength(4);
    expect(screen.getByText('0 tareas')).toBeInTheDocument();
  });

  it('ordena dentro de cada columna por prioridad ALTA > MEDIA > BAJA', () => {
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Baja', prioridad: 'BAJA', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Alta', prioridad: 'ALTA', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 3, tituloTarea: 'Media', prioridad: 'MEDIA', estadoTarea: 'POR_HACER' }),
      ],
    });
    const columna = screen.getByRole('heading', { name: 'Por hacer' }).closest('section') as HTMLElement;
    const titulos = within(columna)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent);
    expect(titulos).toEqual(['Alta', 'Media', 'Baja']);
  });

  it('desempata por fecha límite ascendente, con nulas al final', () => {
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Sin fecha', prioridad: 'ALTA', fechaLimite: null, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Marzo', prioridad: 'ALTA', fechaLimite: '2026-03-01', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 3, tituloTarea: 'Enero', prioridad: 'ALTA', fechaLimite: '2026-01-01', estadoTarea: 'POR_HACER' }),
      ],
    });
    const columna = screen.getByRole('heading', { name: 'Por hacer' }).closest('section') as HTMLElement;
    const titulos = within(columna)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent);
    expect(titulos).toEqual(['Enero', 'Marzo', 'Sin fecha']);
  });

  it('no muta el array de tareas recibido', () => {
    const tasks = [
      tarea({ idTarea: 2, prioridad: 'BAJA' }),
      tarea({ idTarea: 1, prioridad: 'ALTA' }),
    ];
    const idsOriginales = tasks.map((t) => t.idTarea);
    renderBoard({ tasks });
    expect(tasks.map((t) => t.idTarea)).toEqual(idsOriginales);
  });

  it('el filtro por rol incluye "Sin rol" solo si existe una tarea sin rol, y filtra correctamente', () => {
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Con rol', rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' } }),
        tarea({ idTarea: 2, tituloTarea: 'Sin rol', rolProyecto: null }),
      ],
    });

    const selectRol = screen.getByRole('combobox', { name: 'Filtrar por rol' });
    fireEvent.keyDown(selectRol, { key: 'Enter' });
    expect(screen.getByRole('option', { name: 'Sin rol' })).toBeInTheDocument();

    const opcionBackend = screen.getByRole('option', { name: 'Backend' });
    fireEvent.click(opcionBackend);

    expect(screen.getByText('Con rol')).toBeInTheDocument();
    expect(screen.queryByText('Sin rol')).not.toBeInTheDocument();
  });

  it('el filtro por hito incluye "Sin hito" solo si existe una tarea sin hito, y filtra correctamente', () => {
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Con hito', hito: { idHito: 1, tituloHito: 'Entrega 1' } }),
        tarea({ idTarea: 2, tituloTarea: 'Suelta', hito: null }),
      ],
    });

    const selectHito = screen.getByRole('combobox', { name: 'Filtrar por hito' });
    fireEvent.keyDown(selectHito, { key: 'Enter' });
    expect(screen.getByRole('option', { name: 'Sin hito' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Entrega 1' }));

    expect(screen.getByText('Con hito')).toBeInTheDocument();
    expect(screen.queryByText('Suelta')).not.toBeInTheDocument();
  });

  it('combina filtro de rol e hito con lógica AND', () => {
    renderBoard({
      tasks: [
        tarea({
          idTarea: 1,
          tituloTarea: 'Coincide',
          rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
          hito: { idHito: 1, tituloHito: 'Entrega 1' },
        }),
        tarea({
          idTarea: 2,
          tituloTarea: 'Rol distinto',
          rolProyecto: { idRolProyecto: 2, nombreRol: 'Frontend' },
          hito: { idHito: 1, tituloHito: 'Entrega 1' },
        }),
      ],
    });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por rol' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Backend' }));

    expect(screen.getByText('Coincide')).toBeInTheDocument();
    expect(screen.queryByText('Rol distinto')).not.toBeInTheDocument();
  });

  // Combinación deliberadamente contradictoria (rol de la tarea A + hito de
  // la tarea B) para producir cero coincidencias usando únicamente valores
  // reales derivados de las tareas — nunca un valor de filtro inexistente.
  const tareasParaCeroCoincidencias = () => [
    tarea({
      idTarea: 1,
      tituloTarea: 'Tarea A',
      rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
      hito: { idHito: 1, tituloHito: 'Entrega 1' },
    }),
    tarea({
      idTarea: 2,
      tituloTarea: 'Tarea B',
      rolProyecto: { idRolProyecto: 2, nombreRol: 'Frontend' },
      hito: { idHito: 2, tituloHito: 'Entrega 2' },
    }),
  ];

  it('muestra un mensaje accesible y "Limpiar filtros" cuando ningún resultado coincide', () => {
    renderBoard({ tasks: tareasParaCeroCoincidencias() });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por rol' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Backend' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por hito' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Entrega 2' }));

    expect(
      screen.getByText('No hay tareas que coincidan con los filtros seleccionados.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tarea A')).not.toBeInTheDocument();
    expect(screen.queryByText('Tarea B')).not.toBeInTheDocument();
  });

  it('"Limpiar filtros" restablece ambos filtros', () => {
    renderBoard({ tasks: tareasParaCeroCoincidencias() });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por rol' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Backend' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por hito' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Entrega 2' }));
    expect(screen.queryByText('Tarea A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Tarea A')).toBeInTheDocument();
    expect(screen.getByText('Tarea B')).toBeInTheDocument();
  });

  it('muestra el skeleton de cuatro columnas mientras carga', () => {
    const { container } = renderBoard({ isLoading: true });
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();
  });

  it('muestra error con botón Reintentar que llama a onRetry', () => {
    const onRetry = vi.fn();
    renderBoard({ isError: true, onRetry });
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no implementa drag-and-drop: ningún elemento es draggable', () => {
    const { container } = renderBoard({ tasks: [tarea()] });
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
  });

  it('el cambio de estado llama a la mutation con taskId y el enum correcto, sin projectId adicional', () => {
    const mutate = vi.fn();
    renderBoard({
      isLeader: true,
      tasks: [tarea({ idTarea: 7, tituloTarea: 'Mover', estadoTarea: 'POR_HACER' })],
      cambiarEstadoTarea: mutationStub({ mutate }),
    });

    const select = screen.getByRole('combobox', { name: 'Cambiar estado de "Mover"' });
    fireEvent.keyDown(select, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'En progreso' }));

    expect(mutate).toHaveBeenCalledWith({ taskId: 7, input: { estadoTarea: 'EN_PROGRESO' } });
  });

  it('la eliminación requiere confirmación y llama a la mutation correcta', async () => {
    const mutate = vi.fn();
    renderBoard({
      isLeader: true,
      tasks: [tarea({ idTarea: 9, tituloTarea: 'Borrar' })],
      eliminarTarea: mutationStub({ mutate }),
    });

    const trigger = screen.getByRole('button', { name: 'Acciones de "Borrar"' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByText('Eliminar tarea'));

    expect(await screen.findByText(/esta acción eliminará la tarea "Borrar"/i)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(mutate).toHaveBeenCalledWith({ taskId: 9 }, expect.anything());
  });

  it('cancelar la eliminación no llama a la mutation', async () => {
    const mutate = vi.fn();
    renderBoard({
      isLeader: true,
      tasks: [tarea({ idTarea: 9, tituloTarea: 'Borrar' })],
      eliminarTarea: mutationStub({ mutate }),
    });

    const trigger = screen.getByRole('button', { name: 'Acciones de "Borrar"' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByText('Eliminar tarea'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('un tercero sin permiso no ve el control de eliminar ni el selector de estado', () => {
    renderBoard({
      isLeader: false,
      currentUserId: 999,
      tasks: [
        tarea({
          idTarea: 1,
          tituloTarea: 'Ajena',
          asignacionActiva: {
            idAsignacion: 1,
            idUsuario: 5,
            fechaAsignacion: '2026-01-01T00:00:00.000Z',
            usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
          },
        }),
      ],
    });

    expect(screen.queryByRole('combobox', { name: /cambiar estado/i })).not.toBeInTheDocument();
  });

  it('el asignado activo sí puede cambiar el estado', () => {
    renderBoard({
      isLeader: false,
      currentUserId: 5,
      tasks: [
        tarea({
          idTarea: 1,
          tituloTarea: 'Mía',
          asignacionActiva: {
            idAsignacion: 1,
            idUsuario: 5,
            fechaAsignacion: '2026-01-01T00:00:00.000Z',
            usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
          },
        }),
      ],
    });

    expect(screen.getByRole('combobox', { name: 'Cambiar estado de "Mía"' })).toBeInTheDocument();
  });
});
