'use client';

import { useParams } from 'next/navigation';
import { AlertCircle, BarChart3, CheckCircle2, Clock, Flag, ListChecks } from 'lucide-react';
import { useSprintAnalytics, useSprintBurndown } from '@/hooks/use-project-sprints';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { BurndownChart } from '@/components/projects/burndown-chart';
import { ESTADO_COLUMNA_STYLE, ESTADO_LABEL, PRIORIDAD_LABEL } from '@/components/projects/task-board.utils';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import type { EstadoHito, SprintAnalyticsDto } from '@/lib/types/sprints';
import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/**
 * Mismo criterio "exhaustivo por diseño" que `ESTADO_SPRINT_STYLE`/`ESTADO_HITO_STYLE`
 * de las páginas hermanas de Sprints. `bar` usa el mismo tono que el badge:
 * gris, verde lima e institucional.
 */
const ESTADO_HITO_STYLE: Record<EstadoHito, { label: string; className: string; bar: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-surface-container-high text-tertiary', bar: 'bg-outline' },
  EN_PROGRESO: {
    label: 'En progreso',
    className: 'bg-status-warning text-on-status-warning',
    bar: 'bg-accent',
  },
  COMPLETADO: {
    label: 'Completado',
    className: 'bg-primary-container text-on-primary-container',
    bar: 'bg-primary',
  },
};

/** Barras por prioridad: alta en rojo suave, media en lima, baja en gris. */
const PRIORIDAD_BAR: Record<Prioridad, string> = {
  ALTA: 'bg-error/70',
  MEDIA: 'bg-accent',
  BAJA: 'bg-outline',
};

/** Orden fijo de estado/prioridad — nunca derivado del objeto, para que las barras salgan siempre en el mismo orden aunque un valor esté en 0. */
const ORDEN_ESTADO: EstadoTarea[] = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'];
const ORDEN_PRIORIDAD: Prioridad[] = ['ALTA', 'MEDIA', 'BAJA'];

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function DistribucionBar({
  etiqueta,
  cantidad,
  total,
  barClassName,
}: {
  etiqueta: string;
  cantidad: number;
  total: number;
  /** Color semántico de la barra (estado o prioridad). */
  barClassName: string;
}) {
  const porcentaje = total === 0 ? 0 : Math.round((cantidad / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-semibold text-on-surface">{etiqueta}</span>
        <span className="text-tertiary">{cantidad}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full transition-all ${barClassName}`}
          style={{ width: `${porcentaje}%` }}
          role="progressbar"
          aria-valuenow={porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={etiqueta}
        />
      </div>
    </div>
  );
}

function AnalyticsContent({ analytics }: { analytics: SprintAnalyticsDto }) {
  const { tareasPlanificadas, tareasCompletadas, horasEstimadas } = analytics.planificadoVsCompletado;
  const porcentajeCumplimiento =
    tareasPlanificadas === 0 ? 0 : Math.round((tareasCompletadas / tareasPlanificadas) * 100);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Mismo KPI que Miembros y Mis Horas: icono neutro junto a la etiqueta, sin caja. */}
        <HoursKpiCard variante="en-linea" icon={ListChecks} label="Tareas totales" value={String(analytics.tareasTotales)} />
        <HoursKpiCard variante="en-linea" icon={CheckCircle2} label="Tareas completadas" value={String(tareasCompletadas)} />
        <HoursKpiCard variante="en-linea" icon={BarChart3} label="Cumplimiento" value={`${porcentajeCumplimiento}%`} />
        <HoursKpiCard
          variante="en-linea"
          icon={Clock}
          label="Horas estimadas"
          value={`${formatearHoras(horasEstimadas)} h`}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-on-surface">Distribución por estado</h2>
          <div className="space-y-3">
            {ORDEN_ESTADO.map((estado) => (
              <DistribucionBar
                key={estado}
                etiqueta={ESTADO_LABEL[estado]}
                cantidad={analytics.distribucionPorEstado[estado]}
                total={analytics.tareasTotales}
                barClassName={ESTADO_COLUMNA_STYLE[estado].columnDot}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-on-surface">Distribución por prioridad</h2>
          <div className="space-y-3">
            {ORDEN_PRIORIDAD.map((prioridad) => (
              <DistribucionBar
                key={prioridad}
                etiqueta={PRIORIDAD_LABEL[prioridad]}
                cantidad={analytics.distribucionPorPrioridad[prioridad]}
                total={analytics.tareasTotales}
                barClassName={PRIORIDAD_BAR[prioridad]}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
          <Flag className="size-4 text-primary" aria-hidden="true" />
          Hitos
        </h2>
        {analytics.hitos.length === 0 ? (
          <p className="text-sm text-tertiary">Ninguna tarea de este Sprint está vinculada a un hito.</p>
        ) : (
          <div className="space-y-3">
            {analytics.hitos.map((hito) => {
              const estilo = ESTADO_HITO_STYLE[hito.estadoHito];
              return (
                <div key={hito.idHito} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{hito.tituloHito}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className={`h-full rounded-full ${estilo.bar}`}
                        style={{ width: `${hito.porcentaje}%` }}
                        role="progressbar"
                        aria-valuenow={hito.porcentaje}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={hito.tituloHito}
                      />
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
                  >
                    {estilo.label} · {hito.porcentaje}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * T-240 (HU-160): sección independiente del resto de `AnalyticsContent` —
 * su propia query (`useSprintBurndown`), así que un fallo o una carga lenta
 * del burndown nunca bloquea el resto de la analítica ya cargada. Funciona
 * igual para un Sprint `CERRADO` (mismo endpoint, mismas instantáneas
 * históricas tomadas mientras estuvo activo).
 */
function BurndownSection({ idProyecto, idSprint }: { idProyecto: number; idSprint: number }) {
  const { burndown, isLoading, isError, error, refetch } = useSprintBurndown(idProyecto, idSprint);

  if (isLoading) {
    return <Skeleton className="h-[340px] w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {getApiErrorMessage(error, 'general', 'No fue posible cargar el burndown de este Sprint.')}
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
          >
            Reintentar
          </button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!burndown) return null;

  return <BurndownChart burndown={burndown} />;
}

export default function SprintAnalyticsPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { analytics, isLoading, isError, error, refetch } = useSprintAnalytics(idProyecto, idSprint);

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints`, label: 'Volver a Sprints' }}
        title={analytics ? `Analítica del Sprint ${analytics.numero}` : 'Analítica del Sprint'}
        description="Cumplimiento y progreso de este Sprint: tareas, prioridades y hitos."
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {getApiErrorMessage(error, 'general', 'No fue posible cargar la analítica de este Sprint.')}
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && analytics && (
        <>
          <AnalyticsContent analytics={analytics} />
          <div className="mt-6">
            <BurndownSection idProyecto={idProyecto} idSprint={idSprint} />
          </div>
        </>
      )}
    </ProjectPageShell>
  );
}
