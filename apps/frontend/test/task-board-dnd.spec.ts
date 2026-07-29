import { describe, expect, it, vi } from 'vitest';
import { KeyboardCode } from '@dnd-kit/core';
import {
  columnDropId,
  columnKeyboardCoordinateGetter,
  isColumnDropId,
  resolveDragEndAction,
  taskDragAnnouncements,
  taskDragId,
} from '../components/projects/task-board-dnd';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

function keyboardEvent(code: string) {
  return { code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('IDs de drag-and-drop', () => {
  it('taskDragId/columnDropId son deterministas, sin depender de títulos ni índices', () => {
    expect(taskDragId(42)).toBe('task:42');
    expect(columnDropId('EN_PROGRESO')).toBe('column:EN_PROGRESO');
  });

  it('isColumnDropId distingue IDs de columna de IDs de tarea', () => {
    expect(isColumnDropId('column:HECHO')).toBe(true);
    expect(isColumnDropId('task:1')).toBe(false);
    expect(isColumnDropId(42)).toBe(false);
  });
});

describe('columnKeyboardCoordinateGetter', () => {
  const columnas = new Map([
    ['column:POR_HACER', { id: 'column:POR_HACER' }],
    ['column:EN_PROGRESO', { id: 'column:EN_PROGRESO' }],
    ['column:EN_REVISION', { id: 'column:EN_REVISION' }],
    ['column:HECHO', { id: 'column:HECHO' }],
  ]);
  const rects = new Map([
    ['column:POR_HACER', rect(0, 0, 280, 400)],
    ['column:EN_PROGRESO', rect(296, 0, 280, 400)],
    ['column:EN_REVISION', rect(592, 0, 280, 400)],
    ['column:HECHO', rect(888, 0, 280, 400)],
  ]);

  function baseContext(collisionRect: DOMRect | null) {
    return { droppableContainers: columnas, droppableRects: rects, collisionRect } as any;
  }

  it('ArrowRight mueve al centro de la siguiente columna', () => {
    const event = keyboardEvent(KeyboardCode.Right);
    const resultado = columnKeyboardCoordinateGetter(event, {
      active: 'task:1',
      currentCoordinates: { x: 0, y: 0 },
      context: baseContext(rect(0, 0, 272, 80)),
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(resultado).toEqual({ x: 296 + (280 - 272) / 2, y: (400 - 80) / 2 });
  });

  it('ArrowLeft no retrocede antes de la primera columna', () => {
    const event = keyboardEvent(KeyboardCode.Left);
    const resultado = columnKeyboardCoordinateGetter(event, {
      active: 'task:1',
      currentCoordinates: { x: 0, y: 0 },
      context: baseContext(rect(0, 0, 272, 80)),
    });
    expect(resultado).toEqual({ x: (280 - 272) / 2, y: (400 - 80) / 2 });
  });

  it('ArrowRight no avanza más allá de la última columna', () => {
    const event = keyboardEvent(KeyboardCode.Right);
    const resultado = columnKeyboardCoordinateGetter(event, {
      active: 'task:1',
      currentCoordinates: { x: 0, y: 0 },
      context: baseContext(rect(888, 0, 272, 80)),
    });
    expect(resultado).toEqual({ x: 888 + (280 - 272) / 2, y: (400 - 80) / 2 });
  });

  it('ignora teclas distintas de flecha izquierda/derecha (ArrowUp/ArrowDown no navegan orden vertical)', () => {
    const event = keyboardEvent(KeyboardCode.Down);
    const resultado = columnKeyboardCoordinateGetter(event, {
      active: 'task:1',
      currentCoordinates: { x: 0, y: 0 },
      context: baseContext(rect(0, 0, 272, 80)),
    });
    expect(resultado).toBeUndefined();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('sin collisionRect no devuelve coordenadas', () => {
    const event = keyboardEvent(KeyboardCode.Right);
    const resultado = columnKeyboardCoordinateGetter(event, {
      active: 'task:1',
      currentCoordinates: { x: 0, y: 0 },
      context: baseContext(null),
    });
    expect(resultado).toBeUndefined();
  });
});

describe('taskDragAnnouncements', () => {
  const activeTarea = {
    id: 'task:1',
    data: { current: { type: 'task', taskId: 1, estadoOrigen: 'POR_HACER', titulo: 'Diseñar API' } },
  } as any;
  const overColumnaDistinta = {
    id: 'column:EN_PROGRESO',
    data: { current: { type: 'column', estado: 'EN_PROGRESO' } },
  } as any;
  const overColumnaOrigen = {
    id: 'column:POR_HACER',
    data: { current: { type: 'column', estado: 'POR_HACER' } },
  } as any;

  it('onDragStart anuncia el título y el estado actual', () => {
    expect(taskDragAnnouncements.onDragStart({ active: activeTarea })).toBe(
      'Moviendo "Diseñar API". Estado actual: Por hacer.',
    );
  });

  it('onDragOver anuncia la columna sobrevolada', () => {
    expect(
      taskDragAnnouncements.onDragOver!({ active: activeTarea, over: overColumnaDistinta }),
    ).toBe('"Diseñar API" sobre la columna En progreso.');
  });

  it('onDragEnd anuncia el destino cuando cambia de estado', () => {
    expect(taskDragAnnouncements.onDragEnd({ active: activeTarea, over: overColumnaDistinta })).toBe(
      '"Diseñar API" se movió a En progreso.',
    );
  });

  it('onDragEnd anuncia que permanece igual cuando el destino es la misma columna', () => {
    expect(taskDragAnnouncements.onDragEnd({ active: activeTarea, over: overColumnaOrigen })).toBe(
      '"Diseñar API" permanece en Por hacer.',
    );
  });

  it('onDragEnd anuncia que permanece igual sin destino válido', () => {
    expect(taskDragAnnouncements.onDragEnd({ active: activeTarea, over: null })).toBe(
      '"Diseñar API" permanece en Por hacer.',
    );
  });

  it('onDragCancel anuncia la cancelación', () => {
    expect(taskDragAnnouncements.onDragCancel!({ active: activeTarea, over: null })).toBe(
      'Movimiento de "Diseñar API" cancelado.',
    );
  });
});

describe('resolveDragEndAction — regla "solo mover entre columnas" (Tarea 39)', () => {
  const activo = {
    data: { current: { type: 'task', taskId: 7, estadoOrigen: 'POR_HACER', titulo: 'X' } },
  };

  it('columna distinta ⇒ acción con el nuevo estado', () => {
    const over = { data: { current: { type: 'column', estado: 'EN_PROGRESO' } } };
    expect(resolveDragEndAction(activo, over)).toEqual({
      taskId: 7,
      titulo: 'X',
      estadoOrigen: 'POR_HACER',
      estadoDestino: 'EN_PROGRESO',
    });
  });

  it('soltar en la misma columna de origen ⇒ null (sin mutation)', () => {
    const over = { data: { current: { type: 'column', estado: 'POR_HACER' } } };
    expect(resolveDragEndAction(activo, over)).toBeNull();
  });

  it('sin destino (drop fuera de cualquier zona) ⇒ null', () => {
    expect(resolveDragEndAction(activo, null)).toBeNull();
    expect(resolveDragEndAction(activo, undefined)).toBeNull();
  });

  it('destino sin data de columna (cancelado/corrupto) ⇒ null', () => {
    expect(resolveDragEndAction(activo, { data: { current: undefined } })).toBeNull();
  });

  it('active sin data de tarea (drag no gestionado por TaskBoard) ⇒ null', () => {
    const over = { data: { current: { type: 'column', estado: 'EN_PROGRESO' } } };
    expect(resolveDragEndAction({ data: { current: undefined } }, over)).toBeNull();
  });
});
