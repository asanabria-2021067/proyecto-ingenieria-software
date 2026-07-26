import { GripVertical } from 'lucide-react';
import { ESTADO_LABEL } from '@/components/projects/task-board.utils';
import type { EstadoTarea } from '@/lib/types/tasks';

export interface TaskDragOverlayCardProps {
  titulo: string;
  estadoOrigen: EstadoTarea;
}

/**
 * Copia presentacional de la tarjeta para `DragOverlay`: sin menú, sin
 * Select, sin botón de comentarios — evita IDs/controles duplicados
 * mientras la tarjeta real permanece (atenuada) en su columna de origen.
 */
export function TaskDragOverlayCard({ titulo, estadoOrigen }: TaskDragOverlayCardProps) {
  return (
    <div
      aria-hidden="true"
      className="w-72 bg-surface-container-lowest border border-primary/50 rounded-xl p-3 shadow-lg pointer-events-none"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="size-4 text-tertiary shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2">{titulo}</p>
      </div>
      <p className="mt-1 ml-6 text-[11px] text-tertiary">{ESTADO_LABEL[estadoOrigen]}</p>
    </div>
  );
}
