import '@testing-library/jest-dom/vitest';
import { act, createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KeyboardCode } from '@dnd-kit/core';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// Simulación real de un drag por teclado a través de @dnd-kit (no solo de
// la lógica pura de task-board-dnd.spec.ts): jsdom no implementa
// PointerEvent, así que el camino determinista y realista para probar la
// integración completa (sensores → detección de colisión → onDragEnd →
// mutate) es el KeyboardSensor, cuyos eventos sí son KeyboardEvent nativos.
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

  // Rects fijos por columna (colisión determinista): las cuatro columnas
  // ocupan franjas horizontales sin solaparse, y toda tarjeta/handle hereda
  // el rect de la columna que la contiene, vía `data-column-estado`.
  const RECTS: Record<string, { left: number; top: number; width: number; height: number }> = {
    POR_HACER: { left: 0, top: 0, width: 280, height: 400 },
    EN_PROGRESO: { left: 300, top: 0, width: 280, height: 400 },
    EN_REVISION: { left: 600, top: 0, width: 280, height: 400 },
    HECHO: { left: 900, top: 0, width: 280, height: 400 },
  };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const columna = this.closest('[data-column-estado]')?.getAttribute('data-column-estado');
    // Fallback no-cero: el contenido de DragOverlay se mide fuera del árbol
    // de columnas (portal), y @dnd-kit usa esa medición como referencia del
    // "collisionRect" mientras el overlay está activo — un rect de área
    // cero nunca intersecta ninguna columna real.
    const r = (columna && RECTS[columna]) || { left: 0, top: 0, width: 272, height: 80 };
    return {
      ...r,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top,
      toJSON: () => r,
    } as DOMRect;
  });
});

vi.mock('../components/projects/task-comments-dialog', () => ({
  TaskCommentsDialog: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { TaskBoard } from '../components/projects/task-board';

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Diseñar API',
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
    tasks: [tarea()] as TareaPublicaDTO[],
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('TaskBoard — drag-and-drop real vía teclado (Tarea 39)', () => {
  afterEach(() => cleanup());

  it('arrastrar de Por hacer a En progreso llama a cambiarEstadoTarea.mutate con el nuevo estado', async () => {
    const { props } = renderBoard();
    const handle = screen.getByRole('button', { name: 'Mover "Diseñar API" entre estados' });

    act(() => handle.focus());
    fireEvent.keyDown(handle, { code: KeyboardCode.Space });
    await flush();
    fireEvent.keyDown(document, { code: KeyboardCode.Right });
    await flush();
    fireEvent.keyDown(document, { code: KeyboardCode.Space });
    await flush();

    expect((props.cambiarEstadoTarea as any).mutate).toHaveBeenCalledWith(
      { taskId: 1, input: { estadoTarea: 'EN_PROGRESO' } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('soltar en la misma columna (sin mover el foco) no llama a la mutation', async () => {
    const { props } = renderBoard();
    const handle = screen.getByRole('button', { name: 'Mover "Diseñar API" entre estados' });

    act(() => handle.focus());
    fireEvent.keyDown(handle, { code: KeyboardCode.Space });
    await flush();
    fireEvent.keyDown(document, { code: KeyboardCode.Space });
    await flush();

    expect((props.cambiarEstadoTarea as any).mutate).not.toHaveBeenCalled();
  });

  it('Escape cancela el movimiento sin llamar a la mutation', async () => {
    const { props } = renderBoard();
    const handle = screen.getByRole('button', { name: 'Mover "Diseñar API" entre estados' });

    act(() => handle.focus());
    fireEvent.keyDown(handle, { code: KeyboardCode.Space });
    await flush();
    fireEvent.keyDown(document, { code: KeyboardCode.Right });
    await flush();
    fireEvent.keyDown(document, { code: KeyboardCode.Esc });
    await flush();

    expect((props.cambiarEstadoTarea as any).mutate).not.toHaveBeenCalled();
  });

  it('un tercero sin permiso no tiene handle: no puede iniciar ningún drag', () => {
    renderBoard({ isLeader: false, currentUserId: 99 });
    expect(
      screen.queryByRole('button', { name: /Mover .* entre estados/ }),
    ).not.toBeInTheDocument();
  });

  it('muestra la superposición de arrastre (DragOverlay) mientras el drag está activo', async () => {
    renderBoard();
    const handle = screen.getByRole('button', { name: 'Mover "Diseñar API" entre estados' });

    act(() => handle.focus());
    fireEvent.keyDown(handle, { code: KeyboardCode.Space });
    await flush();

    const overlays = screen.getAllByText('Diseñar API');
    expect(overlays.length).toBeGreaterThan(1); // tarjeta original + overlay
  });
});
