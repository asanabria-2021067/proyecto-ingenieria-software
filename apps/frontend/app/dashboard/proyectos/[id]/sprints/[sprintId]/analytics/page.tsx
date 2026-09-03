'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, Clock, Flag, ListChecks } from 'lucide-react';
import { useSprintAnalytics } from '@/hooks/use-project-sprints';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ESTADO_LABEL, PRIORIDAD_LABEL } from '@/components/projects/task-board.utils';
import type { EstadoHito, SprintAnalyticsDto } from '@/lib/types/sprints';
import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';

/** Mismo criterio "exhaustivo por diseño" que `ESTADO_SPRINT_STYLE`/`ESTADO_HITO_STYLE` de las páginas hermanas de Sprints. */
const ESTADO_HITO_STYLE: Record<EstadoHito, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-surface-container-high text-tertiary' },
  EN_PROGRESO: {
    label: 'En progreso',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  COMPLETADO: { label: 'Completado', className: 'bg-primary-container text-on-primary-container' },
};

/** Orden fijo de estado/prioridad — nunca derivado del objeto, para que las barras salgan siempre en el mismo orden aunque un valor esté en 0. */
const ORDEN_ESTADO: EstadoTarea[] = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'];
const ORDEN_PRIORIDAD: Prioridad[] = ['ALTA', 'MEDIA', 'BAJA'];

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-semibold text-tertiary">{label}</p>
        <p className="text-lg font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function DistribucionBar({ etiqueta, cantidad, total }: { etiqueta: string; cantidad: number; total: number }) {
  const porcentaje = total === 0 ? 0 : Math.round((cantidad / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-semibold text-on-surface">{etiqueta}</span>
        <span className="text-tertiary">{cantidad}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all"
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
        <MetricCard icon={ListChecks} label="Tareas totales" value={String(analytics.tareasTotales)} />
        <MetricCard icon={CheckCircle2} label="Tareas completadas" value={String(tareasCompletadas)} />
        <MetricCard icon={BarChart3} label="Cumplimiento" value={`${porcentajeCumplimiento}%`} />
        <MetricCard icon={Clock} label="Horas estimadas" value={`${formatearHoras(horasEstimadas)} h`} />
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
                        className="h-full rounded-full bg-primary"
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

export default function SprintAnalyticsPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { analytics, isLoading, isError, error, refetch } = useSprintAnalytics(idProyecto, idSprint);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={`/dashboard/proyectos/${id}/sprints/${sprintId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al Sprint
      </Link>

      <div className="mb-8 flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">
          {analytics ? `Analítica del Sprint ${analytics.numero}` : 'Analítica del Sprint'}
        </h1>
      </div>
      <p className="-mt-6 mb-8 text-sm text-tertiary">
        Cumplimiento y progreso de este Sprint: tareas, prioridades y hitos.
      </p>

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
              {error instanceof Error && error.message
                ? error.message
                : 'No fue posible cargar la analítica de este Sprint.'}
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

      {!isLoading && !isError && analytics && <AnalyticsContent analytics={analytics} />}
    </div>
  );
}
