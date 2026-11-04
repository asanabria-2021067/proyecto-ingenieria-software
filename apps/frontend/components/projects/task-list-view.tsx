'use client';

import { AlertTriangle, Calendar } from 'lucide-react';
import { Tag } from '@/components/ui/tag';
import { DATA_TABLE_CARD, DATA_TABLE_ROW_HOVER, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import { TaskAvatares, textoResponsables } from '@/components/projects/task-avatares';
import {
  ESTADO_LABEL,
  ESTADO_TAREA_TONE,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  estaVencida,
  formatearFechaLimite,
  ordenarTareas,
  prioridadTextoAccesible,
  responsablesDe,
} from '@/components/projects/task-board.utils';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

interface Props {
  tasks: TareaPublicaDTO[];
  /** Abre el mismo detalle de tarea que el Kanban. */
  onAbrir: (tarea: TareaPublicaDTO) => void;
}

/** MEJ-112: vista de lista, filas compactas con título, estado, prioridad, responsables y fecha límite. */
export function TaskListView({ tasks, onAbrir }: Props) {
  return (
    <ul className={`${DATA_TABLE_CARD} ${DATA_TABLE_ROWS}`} aria-label="Lista de tareas">
      {ordenarTareas(tasks).map((tarea) => {
        const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
        const vencida = estaVencida(tarea);
        const responsables = responsablesDe(tarea);
        return (
          <li
            key={tarea.idTarea}
            className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-stack py-inline ${DATA_TABLE_ROW_HOVER}`}
          >
            <button
              type="button"
              onClick={() => onAbrir(tarea)}
              title={tarea.tituloTarea}
              aria-label={`Abrir detalles de "${tarea.tituloTarea}"`}
              className="min-w-0 flex-1 basis-56 truncate rounded-sm text-left text-sm font-semibold text-on-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {tarea.tituloTarea}
            </button>
            <Tag tone={ESTADO_TAREA_TONE[tarea.estadoTarea]} size="sm">
              {ESTADO_LABEL[tarea.estadoTarea]}
            </Tag>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
              <PrioridadIcon className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true">{PRIORIDAD_LABEL[tarea.prioridad]}</span>
              <span className="sr-only">{prioridadTextoAccesible(tarea.prioridad)}</span>
            </span>
            <span
              className="flex min-w-0 items-center gap-1.5 text-xs text-on-surface-variant"
              title={responsables.map((r) => `${r.nombre} ${r.apellido}`).join(', ') || undefined}
            >
              <TaskAvatares responsables={responsables} />
              <span className="max-w-36 truncate">{textoResponsables(responsables)}</span>
            </span>
            <span className={`inline-flex items-center gap-1 text-xs ${vencida ? 'font-semibold text-destructive' : 'text-tertiary'}`}>
              {vencida && <AlertTriangle className="size-3.5" aria-label="Vencida" />}
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
