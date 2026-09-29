import type { ReactNode } from 'react';

/**
 * Encabezado de columna de tablero (Kanban y preparación de salida): fuera
 * del contenedor de tareas, con punto de color semántico, nombre y un
 * contador compacto neutro. Sin franja ni fondo de color.
 */
export function KanbanColumnHeader({
  headingId,
  titulo,
  dotClassName,
  count,
}: {
  headingId: string;
  titulo: ReactNode;
  dotClassName: string;
  count: number;
}) {
  return (
    <div data-slot="kanban-column-header" className="flex items-center justify-between gap-2 px-1">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span className={`inline-block size-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
        {titulo}
      </h3>
      <span className="pill pill-neutral min-w-6 justify-center font-semibold tabular-nums">{count}</span>
    </div>
  );
}

/** Columna completa: encabezado arriba y, debajo, solo el contenedor de tarjetas. */
export const KANBAN_COLUMN_CLASS = 'flex min-h-0 min-w-0 flex-col gap-2.5';

/** Contenedor neutro de las tarjetas; `isOver` resalta el destino al arrastrar. */
export function kanbanColumnBodyClass(isOver = false): string {
  return `flex flex-1 flex-col gap-2.5 rounded-xl border p-3 transition-all duration-150 ${
    isOver ? 'border-primary bg-primary/5 ring-2 ring-inset ring-primary/25' : 'border-outline-variant/40 bg-surface-container-low'
  }`;
}
