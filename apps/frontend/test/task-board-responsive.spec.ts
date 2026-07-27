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
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('../components/projects/task-comments-dialog', () => ({
  TaskCommentsDialog: () => null,
}));

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

import { TaskBoard } from '../components/projects/task-board';

/** Simula `(max-width: 767px)`: sin este mock, `window.matchMedia` no
 * existe en jsdom y el hook local de TaskBoard se queda en escritorio (por
 * diseño — ver comentario en task-board.tsx). */
function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  (window as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
}

function restoreMatchMedia() {
  delete (window as any).matchMedia;
}

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
    isLeader: true,
    currentUserId: 1,
    cambiarEstadoTarea: mutationStub(),
    eliminarTarea: mutationStub(),
    crearTarea: mutationStub(),
    editarTarea: mutationStub(),
    asignarTarea: mutationStub(),
    desasignarTarea: mutationStub(),
    roles: [],
    milestones: [],
    members: [],
    labels: [],
    labelsLoading: false,
    labelsError: false,
    onRetryLabels: vi.fn(),
    createLabel: mutationStub(),
    updateLabel: mutationStub(),
    deleteLabel: mutationStub(),
    ...overrides,
  };
  const utils = render(createElement(TaskBoard, props as any));
  return { ...utils, props };
}

describe('TaskBoard — responsive (Tarea 39)', () => {
  afterEach(() => {
    cleanup();
    restoreMatchMedia();
  });

  it('sin matchMedia (o escritorio) muestra las cuatro columnas y ninguna navegación móvil', () => {
    renderBoard({
      tasks: [tarea({ idTarea: 1, estadoTarea: 'POR_HACER' }), tarea({ idTarea: 2, estadoTarea: 'HECHO' })],
    });
    expect(screen.getByRole('heading', { name: 'Por hacer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En progreso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En revisión' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hecho' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Estados de tareas' })).not.toBeInTheDocument();
  });

  it('en móvil (matchMedia coincide) solo se ve una columna a la vez, mediante la navegación de estados', () => {
    mockMatchMedia(true);
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Tarea A', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Tarea B', estadoTarea: 'HECHO' }),
      ],
    });

    const nav = screen.getByRole('tablist', { name: 'Estados de tareas' });
    expect(nav).toBeInTheDocument();
    // No se renderizan las cuatro secciones de escritorio (aria-labelledby
    // por columna) al mismo tiempo que la navegación móvil.
    expect(document.querySelector('[aria-labelledby="columna-POR_HACER-heading"]')).not.toBeInTheDocument();

    expect(screen.getByText('Tarea A')).toBeInTheDocument();
    expect(screen.queryByText('Tarea B')).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('tab', { name: /Hecho/ }));

    expect(screen.queryByText('Tarea A')).not.toBeInTheDocument();
    expect(screen.getByText('Tarea B')).toBeInTheDocument();
  });

  it('la navegación móvil muestra el contador de tareas por estado', () => {
    mockMatchMedia(true);
    renderBoard({
      tasks: [
        tarea({ idTarea: 1, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 3, estadoTarea: 'HECHO' }),
      ],
    });
    const porHacerTab = screen.getByRole('tab', { name: /Por hacer/ });
    expect(within(porHacerTab).getByText('2')).toBeInTheDocument();
    const hechoTab = screen.getByRole('tab', { name: /Hecho/ });
    expect(within(hechoTab).getByText('1')).toBeInTheDocument();
  });

  it('el filtro de escritorio permanece accesible aunque esté oculto por CSS', () => {
    renderBoard({ tasks: [tarea()] });
    expect(screen.getByLabelText('Filtrar por rol')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por hito')).toBeInTheDocument();
  });

  it('en móvil los filtros se agrupan bajo un botón "Filtros" que abre rol/hito/limpiar', () => {
    mockMatchMedia(true);
    renderBoard({ tasks: [tarea()] });

    const botonFiltros = screen.getByRole('button', { name: /Filtros/ });
    expect(botonFiltros).toBeInTheDocument();
    fireEvent.click(botonFiltros);

    expect(screen.getByText('Filtros del tablero')).toBeInTheDocument();
    expect(screen.getByLabelText('Rol')).toBeInTheDocument();
    expect(screen.getByLabelText('Hito')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('muestra "Sincronizando…" cuando isFetching es true, sin ocultar el tablero', () => {
    renderBoard({ tasks: [tarea({ tituloTarea: 'Visible' })], isFetching: true });
    expect(screen.getByText('Sincronizando…')).toBeInTheDocument();
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('no muestra "Sincronizando…" cuando isFetching es false', () => {
    renderBoard({ tasks: [tarea()], isFetching: false });
    expect(screen.queryByText('Sincronizando…')).not.toBeInTheDocument();
  });

  it('proyecto sin tareas muestra el estado vacío del tablero (Sección 47)', () => {
    renderBoard({ tasks: [] });
    expect(screen.getByText('Aún no hay tareas')).toBeInTheDocument();
  });

  it('focusTaskId resalta la tarea y, en móvil, selecciona su columna (Sección 63)', async () => {
    mockMatchMedia(true);
    renderBoard({
      focusTaskId: 2,
      tasks: [
        tarea({ idTarea: 1, tituloTarea: 'Tarea A', estadoTarea: 'POR_HACER' }),
        tarea({ idTarea: 2, tituloTarea: 'Tarea B', estadoTarea: 'EN_REVISION' }),
      ],
    });

    // El detalle ya no es un Sheet: la tarea indicada solo se resalta y, en
    // móvil, se alinea la columna activa con su estado. El detalle completo vive
    // en su ruta dedicada.
    expect(await screen.findByText('Tarea indicada desde una notificación.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /En revisión/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('focusTaskId de una tarea inexistente muestra un mensaje accesible sin romper el tablero', () => {
    renderBoard({ focusTaskId: 999, tasks: [tarea({ idTarea: 1 })] });
    expect(screen.getByText('La tarea indicada ya no está disponible.')).toBeInTheDocument();
  });

  it('sin focusTaskId no muestra ningún mensaje de tarea ausente', () => {
    renderBoard({ focusTaskId: null, tasks: [tarea()] });
    expect(screen.queryByText('La tarea indicada ya no está disponible.')).not.toBeInTheDocument();
  });
});
