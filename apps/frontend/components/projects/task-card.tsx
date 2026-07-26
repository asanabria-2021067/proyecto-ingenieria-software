'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Flag,
  GripVertical,
  MessageCircle,
  Minus,
  MoreVertical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { taskDragId, type TaskDragData } from '@/components/projects/task-board-dnd';
import {
  COLUMNAS_TABLERO,
  ESTADO_LABEL,
  PRIORIDAD_LABEL,
  estaVencida,
  formatearFechaLimite,
} from '@/components/projects/task-board.utils';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';

const PRIORIDAD_ICON: Record<TareaPublicaDTO['prioridad'], typeof ArrowUp> = {
  ALTA: ArrowUp,
  MEDIA: Minus,
  BAJA: ArrowDown,
};

const PRIORIDAD_COLOR: Record<TareaPublicaDTO['prioridad'], string> = {
  ALTA: 'text-red-600 dark:text-red-400',
  MEDIA: 'text-amber-600 dark:text-amber-400',
  BAJA: 'text-blue-500 dark:text-blue-400',
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

export interface TaskCardProps {
  tarea: TareaPublicaDTO;
  puedeCambiarEstado: boolean;
  puedeEliminar: boolean;
  puedeEditar: boolean;
  estadoPending: boolean;
  estadoError: string | null;
  onCambiarEstado: (nuevoEstado: EstadoTarea) => void;
  onAbrirComentarios: () => void;
  onSolicitarEliminar: () => void;
  onEditar: () => void;
  /** Resaltado temporal al llegar desde el enlace de una notificación. */
  resaltada?: boolean;
  /** Registro de refs por tarea para scroll/foco (notificación y post-drag). */
  onRegistrarCardRef?: (idTarea: number, el: HTMLElement | null) => void;
  onRegistrarHandleRef?: (idTarea: number, el: HTMLButtonElement | null) => void;
}

export function TaskCard({
  tarea,
  puedeCambiarEstado,
  puedeEliminar,
  puedeEditar,
  estadoPending,
  estadoError,
  onCambiarEstado,
  onAbrirComentarios,
  onSolicitarEliminar,
  onEditar,
  resaltada = false,
  onRegistrarCardRef,
  onRegistrarHandleRef,
}: TaskCardProps) {
  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
  const vencida = estaVencida(tarea);
  const asignado = tarea.asignacionActiva?.usuario ?? null;

  // La tarjeta solo puede arrastrarse con el mismo permiso que habilita el
  // Select de estado (líder o asignado activo) — nunca una regla distinta —
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
      className={`bg-surface-container-lowest border rounded-xl p-3 shadow-sm space-y-2 transition-colors ${
        resaltada
          ? 'border-primary ring-2 ring-primary/50 bg-primary/5'
          : 'border-outline-variant/30'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {resaltada && (
        <p id={`tarea-resaltada-${tarea.idTarea}`} className="sr-only">
          Tarea indicada desde una notificación.
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
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
                className="shrink-0 -ml-1 -mt-0.5 flex items-center justify-center size-7 rounded-md text-tertiary hover:text-on-surface hover:bg-surface-container-high cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Arrastrar para mover entre estados</TooltipContent>
          </Tooltip>
        )}
        <h4 className="text-sm font-semibold text-on-surface leading-snug line-clamp-2 flex-1">
          {tarea.tituloTarea}
        </h4>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones de "${tarea.tituloTarea}"`}
              className="shrink-0 -mt-1 -mr-1 text-tertiary hover:text-on-surface"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {puedeEditar && (
              <DropdownMenuItem onSelect={onEditar}>
                Editar tarea
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onAbrirComentarios}>
              Ver comentarios
            </DropdownMenuItem>
            {puedeEliminar && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onSolicitarEliminar}>
                  Eliminar tarea
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {tarea.descripcionTarea && (
        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
          {tarea.descripcionTarea}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={`inline-flex items-center gap-1 font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
          <PrioridadIcon className="size-3.5" aria-hidden="true" />
          {PRIORIDAD_LABEL[tarea.prioridad]}
        </span>

        {tarea.rolProyecto && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary-container text-on-secondary-container font-medium">
            {tarea.rolProyecto.nombreRol}
          </span>
        )}
      </div>

      {tarea.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tarea.etiquetas.map((etiqueta) => (
            <TaskLabelChip key={etiqueta.idEtiqueta} etiqueta={etiqueta} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-tertiary">
        <Flag className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {tarea.hito ? `Hito · ${tarea.hito.tituloHito}` : 'Sin hito'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Avatar className="size-6">
          {asignado?.fotoUrl && <AvatarImage src={asignado.fotoUrl} alt="" />}
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
            {asignado ? getInitials(asignado.nombre, asignado.apellido) : '—'}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs text-on-surface-variant truncate">
          {asignado ? `${asignado.nombre} ${asignado.apellido}` : 'Sin asignar'}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span
          className={`inline-flex items-center gap-1 ${vencida ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-tertiary'}`}
        >
          <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
          {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha'}
          {vencida && (
            <span className="inline-flex items-center gap-0.5">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Vencida
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={onAbrirComentarios}
          aria-label={`Abrir ${tarea.cantidadComentarios} comentarios de "${tarea.tituloTarea}"`}
          className="inline-flex items-center gap-1 text-tertiary hover:text-on-surface transition-colors ml-auto"
        >
          <MessageCircle className="size-3.5" aria-hidden="true" />
          {tarea.cantidadComentarios}
        </button>
      </div>

      {puedeCambiarEstado && (
        <Select
          value={tarea.estadoTarea}
          disabled={estadoPending}
          onValueChange={(valor) => {
            if (valor === tarea.estadoTarea) return;
            onCambiarEstado(valor as EstadoTarea);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Cambiar estado de "${tarea.tituloTarea}"`}
            className="w-full text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUMNAS_TABLERO.map((columna) => (
              <SelectItem key={columna.estado} value={columna.estado}>
                {ESTADO_LABEL[columna.estado]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {estadoError && (
        <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
          {estadoError}
        </p>
      )}
    </article>
  );
}
