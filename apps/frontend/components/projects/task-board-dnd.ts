import { KeyboardCode, type Announcements, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { ESTADO_LABEL } from '@/components/projects/task-board.utils';
import type { EstadoTarea } from '@/lib/types/tasks';

/**
 * IDs deterministas para @dnd-kit, sin depender de índices ni de títulos.
 * `task:<idTarea>` / `column:<estadoTarea>` — el estado es el único destino
 * persistente (Tarea 39: sin sortIndex, sin @dnd-kit/sortable).
 */
const TASK_DRAG_PREFIX = 'task:';
const COLUMN_DROP_PREFIX = 'column:';

export function taskDragId(idTarea: number): string {
  return `${TASK_DRAG_PREFIX}${idTarea}`;
}

export function columnDropId(estado: EstadoTarea): string {
  return `${COLUMN_DROP_PREFIX}${estado}`;
}

export function isColumnDropId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(COLUMN_DROP_PREFIX);
}

export interface TaskDragData {
  type: 'task';
  taskId: number;
  estadoOrigen: EstadoTarea;
  titulo: string;
}

export interface ColumnDropData {
  type: 'column';
  estado: EstadoTarea;
}

/** Restricciones de activación: evitan iniciar un drag al intentar pulsar
 * el menú, el Select o los botones de la tarjeta. */
export const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 } as const;
/** delay+tolerance en vez de distance puro: permite hacer scroll vertical
 * con el dedo sin iniciar un drag accidental. */
export const TOUCH_ACTIVATION_CONSTRAINT = { delay: 200, tolerance: 8 } as const;

/**
 * Getter de teclado propio (sin @dnd-kit/sortable): ArrowLeft/ArrowRight
 * mueven el foco de arrastre entre los centros de las zonas droppable
 * `column:*` únicamente — nunca entre posiciones verticales de tarjetas,
 * porque no existe orden manual que navegar.
 */
export const columnKeyboardCoordinateGetter: KeyboardCoordinateGetter = (event, { context }) => {
  const { droppableContainers, droppableRects, collisionRect } = context;
  if (!collisionRect) return undefined;
  if (event.code !== KeyboardCode.Left && event.code !== KeyboardCode.Right) {
    return undefined;
  }
  event.preventDefault();

  const columnas = Array.from(droppableContainers.values())
    .filter((contenedor) => isColumnDropId(contenedor.id))
    .map((contenedor) => ({ id: contenedor.id, rect: droppableRects.get(contenedor.id) }))
    .filter((entrada): entrada is { id: typeof entrada.id; rect: NonNullable<typeof entrada.rect> } =>
      Boolean(entrada.rect),
    )
    .sort((a, b) => a.rect.left - b.rect.left);

  if (columnas.length === 0) return undefined;

  const centroActualX = collisionRect.left + collisionRect.width / 2;
  let indiceActual = columnas.findIndex(
    (columna) => centroActualX >= columna.rect.left && centroActualX < columna.rect.left + columna.rect.width,
  );
  if (indiceActual === -1) {
    indiceActual = columnas.reduce((masCercano, columna, indice) => {
      const centro = columna.rect.left + columna.rect.width / 2;
      const centroMasCercano = columnas[masCercano].rect.left + columnas[masCercano].rect.width / 2;
      return Math.abs(centro - centroActualX) < Math.abs(centroMasCercano - centroActualX) ? indice : masCercano;
    }, 0);
  }

  const indiceSiguiente =
    event.code === KeyboardCode.Right
      ? Math.min(indiceActual + 1, columnas.length - 1)
      : Math.max(indiceActual - 1, 0);

  const destino = columnas[indiceSiguiente].rect;
  return {
    x: destino.left + (destino.width - collisionRect.width) / 2,
    y: destino.top + (destino.height - collisionRect.height) / 2,
  };
};

function tareaData(active: { data: { current?: unknown } }): TaskDragData | undefined {
  const data = active.data.current as TaskDragData | undefined;
  return data?.type === 'task' ? data : undefined;
}

function columnaData(over: { data: { current?: unknown } } | null | undefined): ColumnDropData | undefined {
  const data = over?.data.current as ColumnDropData | undefined;
  return data?.type === 'column' ? data : undefined;
}

export interface DragEndAction {
  taskId: number;
  titulo: string;
  estadoOrigen: EstadoTarea;
  estadoDestino: EstadoTarea;
}

/**
 * Decide qué debe ocurrir al soltar una tarjeta: `null` cuando no debe
 * dispararse ninguna mutation (mismo estado, fuera de una columna, o datos
 * ausentes). Función pura y sin dependencias de @dnd-kit, para poder cubrir
 * exhaustivamente cada combinación sin tener que simular un drag real vía
 * sensores — TaskBoard.handleDragEnd solo la invoca con `event.active`/
 * `event.over`.
 */
export function resolveDragEndAction(
  active: { data: { current?: unknown } },
  over: { data: { current?: unknown } } | null | undefined,
): DragEndAction | null {
  const data = tareaData(active);
  if (!data) return null;
  const destino = columnaData(over);
  if (!destino || destino.estado === data.estadoOrigen) return null;
  return {
    taskId: data.taskId,
    titulo: data.titulo,
    estadoOrigen: data.estadoOrigen,
    estadoDestino: destino.estado,
  };
}

/**
 * Anuncios accesibles de inicio/movimiento/fin/cancelación. `onDragEnd` solo
 * describe el resultado sincrónico del soltado (destino resuelto vs. mismo
 * estado); el resultado real de la mutation (éxito/rollback tras la
 * respuesta HTTP) se anuncia por separado en TaskBoard mediante una región
 * viva propia, porque ocurre de forma asíncrona después de este callback.
 */
export const taskDragAnnouncements: Announcements = {
  onDragStart({ active }) {
    const data = tareaData(active);
    if (!data) return undefined;
    return `Moviendo "${data.titulo}". Estado actual: ${ESTADO_LABEL[data.estadoOrigen]}.`;
  },
  onDragOver({ active, over }) {
    const data = tareaData(active);
    const destino = columnaData(over);
    if (!data || !destino) return undefined;
    return `"${data.titulo}" sobre la columna ${ESTADO_LABEL[destino.estado]}.`;
  },
  onDragEnd({ active, over }) {
    const data = tareaData(active);
    if (!data) return undefined;
    const destino = columnaData(over);
    if (!destino || destino.estado === data.estadoOrigen) {
      return `"${data.titulo}" permanece en ${ESTADO_LABEL[data.estadoOrigen]}.`;
    }
    return `"${data.titulo}" se movió a ${ESTADO_LABEL[destino.estado]}.`;
  },
  onDragCancel({ active }) {
    const data = tareaData(active);
    if (!data) return undefined;
    return `Movimiento de "${data.titulo}" cancelado.`;
  },
};
