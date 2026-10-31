'use client';

import Link from 'next/link';
import { Clock, ListChecks } from 'lucide-react';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { ESTADO_LABEL, ESTADO_TAREA_TONE } from '@/components/projects/task-board.utils';

interface MyTasksCardProps {
  idProyecto: number;
  idUsuario: number;
}

/**
 * NL-T4: «Mis tareas en este proyecto» arriba del Resumen. Muestra las tareas
 * con asignación activa del usuario y lleva directo al registro de horas de
 * cada una (`?section=hours` en el detalle de la tarea).
 */
export function MyTasksCard({ idProyecto, idUsuario }: MyTasksCardProps) {
  const { tasks, isLoading, isError, refetch } = useProjectTasks(idProyecto);
  const base = `/dashboard/projects/${idProyecto}/kanban`;
  const mias = tasks.filter((t) => t.asignacionActiva?.idUsuario === idUsuario);

  return (
    <section aria-labelledby="mis-tareas-titulo" className="card-base">
      <h2 id="mis-tareas-titulo" className="type-subtitle flex items-center gap-tight">
        <ListChecks className="size-4 text-text-secondary" aria-hidden="true" />
        Mis tareas en este proyecto
      </h2>
      {isLoading ? (
        <p className="type-body mt-tight text-text-secondary">Cargando tus tareas…</p>
      ) : isError ? (
        <div className="mt-tight flex flex-wrap items-center gap-stack" role="alert">
          <p className="type-body text-text-secondary">No se pudieron cargar tus tareas.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-control border border-outline-variant px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            Reintentar
          </button>
        </div>
      ) : mias.length === 0 ? (
        <p className="type-body mt-tight text-text-secondary">Aún no tienes tareas asignadas en este proyecto.</p>
      ) : (
        <ul className="mt-inline flex flex-col divide-y divide-outline-variant/50">
          {mias.map((t) => (
            <li key={t.idTarea} className="flex flex-wrap items-center gap-x-stack gap-y-tight py-inline">
              <Link
                href={`${base}/tasks/${t.idTarea}`}
                className="type-body min-w-0 flex-1 font-medium text-text-primary underline-offset-4 hover:underline"
              >
                {t.tituloTarea}
              </Link>
              <span className={`pill pill-${ESTADO_TAREA_TONE[t.estadoTarea]}`}>{ESTADO_LABEL[t.estadoTarea]}</span>
              <Link
                href={`${base}/tasks/${t.idTarea}?section=hours`}
                aria-label={`Registrar horas en "${t.tituloTarea}"`}
                className="inline-flex items-center gap-1.5 rounded-control border border-outline-variant px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5"
              >
                <Clock className="size-4" aria-hidden="true" />
                Registrar horas
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
