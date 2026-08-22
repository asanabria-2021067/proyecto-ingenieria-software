'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  AlertTriangle,
  Calendar,
  Flag,
  GripVertical,
  MessageCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { taskDragId, type TaskDragData } from '@/components/projects/task-board-dnd';
import {
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  estaVencida,
  formatearFechaLimite,
} from '@/components/projects/task-board.utils';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

/** Cuántas etiquetas se muestran en la tarjeta antes de resumir el resto en "+N". */
const MAX_ETIQUETAS_VISIBLES = 2;

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

export interface TaskCardProps {
  tarea: TareaPublicaDTO;
  /** Habilita el handle de arrastre (líder o asignado activo). */
  puedeCambiarEstado: boolean;
  puedeEliminar?: boolean;
  puedeEditar?: boolean;
  estadoPending: boolean;
  /** Navega a la vista dedicada de la tarea (sección Detalles). */
  onAbrirDetalles: () => void;
  /** Navega a la vista dedicada de la tarea enfocando los comentarios. */
  onAbrirComentarios: () => void;
  /** @deprecated La edición y eliminación viven ahora en la vista dedicada. */
  onSolicitarEliminar?: () => void;
  /** @deprecated La edición y eliminación viven ahora en la vista dedicada. */
  onEditar?: () => void;
  /** Resaltado temporal al llegar desde el enlace de una notificación. */
  resaltada?: boolean;
  /** Registro de refs por tarea para scroll/foco (notificación y post-drag). */
  onRegistrarCardRef?: (idTarea: number, el: HTMLElement | null) => void;
  onRegistrarHandleRef?: (idTarea: number, el: HTMLButtonElement | null) => void;
}

export function TaskCard({
  tarea,
  puedeCambiarEstado,
  estadoPending,
  onAbrirDetalles,
  onAbrirComentarios,
  resaltada = false,
  onRegistrarCardRef,
  onRegistrarHandleRef,
}: TaskCardProps) {
  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
  const vencida = estaVencida(tarea);
  const asignado = tarea.asignacionActiva?.usuario ?? null;

  const etiquetasVisibles = tarea.etiquetas.slice(0, MAX_ETIQUETAS_VISIBLES);
  const etiquetasRestantes = tarea.etiquetas.slice(MAX_ETIQUETAS_VISIBLES);

  // La tarjeta solo puede arrastrarse con el mismo permiso que habilita el
  // cambio de estado (líder o asignado activo) — nunca una regla distinta —
  // y nunca mientras esta tarea ya tiene una mutation de estado en curso.
  const puedeArrastrar = puedeCambiarEstado && !estadoPending;
  const dragData: TaskDragData = {
    type: 'task',
    taskId: tarea.idTarea,
    estadoOrigen: tarea.estadoTarea,
    titulo: tarea.tituloTarea,
  };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: taskDragId(tarea.idTarea),
    data: dragData,
    disabled: !puedeArrastrar,
    attributes: {
      roleDescription: 'tarea arrastrable',
    },
  });
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={(el) => {
        setNodeRef(el);
        onRegistrarCardRef?.(tarea.idTarea, el);
      }}
      style={dragStyle}
      aria-busy={estadoPending}
      aria-describedby={resaltada ? `tarea-resaltada-${tarea.idTarea}` : undefined}
      className={`space-y-2 rounded-lg border bg-surface-container-lowest p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-outline-variant/60 hover:shadow-md ${
        resaltada
          ? 'border-primary bg-primary/5 ring-2 ring-primary/50'
          : 'border-outline-variant/30'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {resaltada && (
        <p id={`tarea-resaltada-${tarea.idTarea}`} className="sr-only">
          Tarea indicada desde una notificación.
        </p>
      )}

      {/* Fila superior: handle + título + menú (Sección 36) */}
      <div className="flex items-start gap-1.5">
        {puedeArrastrar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={(el) => {
                  setActivatorNodeRef(el);
                  onRegistrarHandleRef?.(tarea.idTarea, el);
                }}
                {...listeners}
                {...attributes}
                aria-label={`Mover "${tarea.tituloTarea}" entre estados`}
                className="-ml-1 -mt-0.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-tertiary hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Arrastrar para mover entre estados</TooltipContent>
          </Tooltip>
        )}

        <h4 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onAbrirDetalles}
            title={tarea.tituloTarea}
            aria-label={`Abrir detalles de "${tarea.tituloTarea}"`}
            className="line-clamp-2 w-full text-left text-sm font-semibold leading-snug text-on-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
          >
            {tarea.tituloTarea}
          </button>
        </h4>
      </div>

      {/* Segunda fila: prioridad + rol (Sección 39-40) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={`inline-flex items-center gap-1 font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
          <PrioridadIcon className="size-3.5" aria-hidden="true" />
          {PRIORIDAD_LABEL[tarea.prioridad]}
        </span>
        {tarea.rolProyecto && (
          <span className="inline-flex max-w-40 items-center truncate rounded-md bg-secondary-container px-2 py-0.5 font-medium text-on-secondary-container">
            {tarea.rolProyecto.nombreRol}
          </span>
        )}
      </div>

      {/* Tercera fila: hasta dos etiquetas + "+N" (Sección 41) */}
      {tarea.etiquetas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {etiquetasVisibles.map((etiqueta) => (
            <TaskLabelChip key={etiqueta.idEtiqueta} etiqueta={etiqueta} />
          ))}
          {etiquetasRestantes.length > 0 && (
            <span
              title={etiquetasRestantes.map((e) => e.nombreEtiqueta).join(', ')}
              className="inline-flex items-center rounded-md bg-surface-container-high px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant"
            >
              +{etiquetasRestantes.length}
            </span>
          )}
        </div>
      )}

      {/* Footer: asignado · fecha · comentarios · hito (Sección 36) */}
      <div className="flex items-center gap-2 text-xs text-tertiary">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-6 shrink-0">
            {asignado?.fotoUrl && <AvatarImage src={asignado.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
              {asignado ? getInitials(asignado.nombre, asignado.apellido) : '—'}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-on-surface-variant">
            {asignado ? `${asignado.nombre} ${asignado.apellido}` : 'Sin asignar'}
          </span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1 ${vencida ? 'font-semibold text-red-600 dark:text-red-400' : 'text-tertiary'}`}
          >
            {vencida && <AlertTriangle className="size-3.5" aria-label="Vencida" />}
            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
            {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha'}
          </span>

          <button
            type="button"
            onClick={onAbrirComentarios}
            aria-label={`Abrir comentarios de "${tarea.tituloTarea}"`}
            className="inline-flex items-center gap-1 text-tertiary transition-colors hover:text-on-surface"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {tarea.cantidadComentarios}
          </button>

          {tarea.hito && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center text-tertiary"
                  aria-label={`Hito: ${tarea.hito.tituloHito}`}
                >
                  <Flag className="size-3.5" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Hito: {tarea.hito.tituloHito}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
    </article>
  );
}
