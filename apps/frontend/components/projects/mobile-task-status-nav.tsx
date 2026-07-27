'use client';

import { useDroppable } from '@dnd-kit/core';
import { columnDropId, type ColumnDropData } from '@/components/projects/task-board-dnd';
import { COLUMNAS_TABLERO, ESTADO_LABEL } from '@/components/projects/task-board.utils';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';

interface NavButtonProps {
  estado: EstadoTarea;
  activo: boolean;
  contador: number;
  onSeleccionar: (estado: EstadoTarea) => void;
}

/**
 * Cada botón de estado es también una zona droppable (Tarea 39, §28): en
 * móvil solo una columna es visible, así que soltar sobre el estado
 * destino en esta navegación reemplaza al drop directo sobre la columna.
 */
function NavButton({ estado, activo, contador, onSeleccionar }: NavButtonProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(estado),
    data: { type: 'column', estado } satisfies ColumnDropData,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={activo}
      aria-current={activo ? 'true' : undefined}
      onClick={() => onSeleccionar(estado)}
      className={`min-w-[84px] min-h-11 shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        activo
          ? 'bg-primary text-on-primary'
          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
      } ${isOver && !activo ? 'ring-2 ring-primary ring-offset-1' : ''}`}
    >
      <span>{ESTADO_LABEL[estado]}</span>
      <span className={activo ? 'text-[10px] text-on-primary/80' : 'text-[10px] text-tertiary'}>
        {contador}
      </span>
    </button>
  );
}

export interface MobileTaskStatusNavProps {
  tareas: TareaPublicaDTO[];
  estadoSeleccionado: EstadoTarea;
  onSeleccionarEstado: (estado: EstadoTarea) => void;
}

export function MobileTaskStatusNav({
  tareas,
  estadoSeleccionado,
  onSeleccionarEstado,
}: MobileTaskStatusNavProps) {
  return (
    <div role="tablist" aria-label="Estados de tareas" className="flex gap-2 overflow-x-auto pb-1">
      {COLUMNAS_TABLERO.map((columna) => (
        <NavButton
          key={columna.estado}
          estado={columna.estado}
          activo={columna.estado === estadoSeleccionado}
          contador={tareas.filter((t) => t.estadoTarea === columna.estado).length}
          onSeleccionar={onSeleccionarEstado}
        />
      ))}
    </div>
  );
}
