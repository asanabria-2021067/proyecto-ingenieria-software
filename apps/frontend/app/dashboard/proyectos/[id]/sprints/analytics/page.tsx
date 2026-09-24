'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, BarChart3, Repeat } from 'lucide-react';
import { useSprintsAnalytics } from '@/hooks/use-project-sprints';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { EstadoSprint, SprintComparativeAnalyticsItemDto } from '@/lib/types/sprints';
import { getApiErrorMessage } from '@/components/projects/api-error';

/** Mismo criterio "exhaustivo por diseño" que `ESTADO_SPRINT_STYLE` en `sprints/page.tsx`/`sprints/[sprintId]/page.tsx`. */
const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'Activo', className: 'bg-primary-container text-on-primary-container' },
  EN_FINALIZACION: {
    label: 'En finalización',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  CERRADO: { label: 'Cerrado', className: 'bg-surface-container-high text-tertiary' },
};

/**
 * Barra horizontal proporcional al máximo de `tareasCompletadas` entre los
 * Sprints listados — "tareas completadas por sprint" (T-173), nunca una
 * métrica de velocity: no compara horas/puntos, solo cuenta tareas.
 */
function BarraTareasCompletadas({ sprint, maximo }: { sprint: SprintComparativeAnalyticsItemDto; maximo: number }) {
  const porcentajeAncho = maximo === 0 ? 0 : Math.round((sprint.tareasCompletadas / maximo) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm font-semibold text-on-surface">Sprint {sprint.numero}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${porcentajeAncho}%` }}
          role="progressbar"
          aria-valuenow={sprint.tareasCompletadas}
          aria-valuemin={0}
          aria-valuemax={maximo}
          aria-label={`Tareas completadas en Sprint ${sprint.numero}`}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-sm font-bold text-on-surface">{sprint.tareasCompletadas}</span>
    </div>
  );
}

/**
 * T-241 (HU-160): barra de velocidad por Sprint CERRADO, en story points
 * completados. `sprint.puntosHistoriaCompletados === null` es "sin puntos
 * asignados" — no se dibuja como una barra en 0, se rotula explícitamente.
 */
function BarraVelocidad({ sprint, maximo }: { sprint: SprintComparativeAnalyticsItemDto; maximo: number }) {
  const puntos = sprint.puntosHistoriaCompletados;
  const porcentajeAncho = puntos === null || maximo === 0 ? 0 : Math.round((puntos / maximo) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm font-semibold text-on-surface">Sprint {sprint.numero}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container-high">
        {puntos !== null && (
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${porcentajeAncho}%` }}
            role="progressbar"
            aria-valuenow={puntos}
            aria-valuemin={0}
            aria-valuemax={maximo}
            aria-label={`Story points completados en Sprint ${sprint.numero}`}
          />
        )}
      </div>
      <span className="w-32 shrink-0 text-right text-sm font-bold text-on-surface">
        {puntos === null ? 'Sin puntos asignados' : `${puntos} pts`}
      </span>
    </div>
  );
}

/**
 * T-241 (HU-160): velocidad — la métrica PRINCIPAL de la comparativa, en
 * story points, solo para Sprints `CERRADO` (la velocidad se alimenta del
 * congelado de T-239, nunca del estado actual). El promedio ignora los
 * Sprints "sin puntos asignados": promediarlos como 0 castigaría
 * falsamente la referencia para comprometer el siguiente Sprint.
 */
function SeccionVelocidad({ sprints }: { sprints: SprintComparativeAnalyticsItemDto[] }) {
  const sprintsCerrados = sprints.filter((sprint) => sprint.estado === 'CERRADO');
  const conPuntos = sprintsCerrados.filter(
    (sprint): sprint is SprintComparativeAnalyticsItemDto & { puntosHistoriaCompletados: number } =>
      sprint.puntosHistoriaCompletados !== null,
  );
  const promedio =
    conPuntos.length === 0
      ? null
      : Math.round(
          (conPuntos.reduce((acumulado, sprint) => acumulado + sprint.puntosHistoriaCompletados, 0) /
            conPuntos.length) *
            10,
        ) / 10;
  const maximo = Math.max(1, ...conPuntos.map((sprint) => sprint.puntosHistoriaCompletados));

  return (
    <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-bold text-on-surface">Velocidad (story points completados)</h2>
      <p className="mb-4 text-xs text-tertiary">
        Story points completados por Sprint cerrado. El promedio es la referencia para comprometer el siguiente
        Sprint.
      </p>
      {sprintsCerrados.length === 0 ? (
        <p className="text-sm text-tertiary">Aún no hay Sprints cerrados para calcular la velocidad.</p>
      ) : (
        <>
          <div className="space-y-3">
            {sprintsCerrados.map((sprint) => (
              <BarraVelocidad key={sprint.idSprint} sprint={sprint} maximo={maximo} />
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-on-surface">
            Promedio: {promedio === null ? 'sin datos suficientes' : `${promedio} pts / sprint`}
          </p>
        </>
      )}
    </div>
  );
}

function ComparativeContent({ sprints }: { sprints: SprintComparativeAnalyticsItemDto[] }) {
  const maximoTareasCompletadas = Math.max(1, ...sprints.map((sprint) => sprint.tareasCompletadas));

  return (
    <>
      <SeccionVelocidad sprints={sprints} />

      <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-on-surface">Tareas completadas por sprint</h2>
        <p className="mb-4 text-xs text-tertiary">Vista alternativa por número de tareas, no la métrica principal.</p>
        <div className="space-y-3">
          {sprints.map((sprint) => (
            <BarraTareasCompletadas key={sprint.idSprint} sprint={sprint} maximo={maximoTareasCompletadas} />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-xs font-semibold text-tertiary">
              <th className="px-4 py-3">Sprint</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Planificadas</th>
              <th className="px-4 py-3">Completadas</th>
              <th className="px-4 py-3">Cumplimiento</th>
              <th className="px-4 py-3">Hitos (evolución)</th>
            </tr>
          </thead>
          <tbody>
            {sprints.map((sprint) => {
              const estilo = ESTADO_SPRINT_STYLE[sprint.estado];
              return (
                <tr key={sprint.idSprint} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-on-surface">Sprint {sprint.numero}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
                    >
                      {estilo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface">{sprint.tareasPlanificadas}</td>
                  <td className="px-4 py-3 text-on-surface">{sprint.tareasCompletadas}</td>
                  <td className="px-4 py-3 text-on-surface">{sprint.porcentajeCumplimiento}%</td>
                  <td className="px-4 py-3 text-on-surface">
                    {sprint.hitosCompletados} / {sprint.hitosTotales}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function SprintsAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { sprints, isLoading, isError, error, refetch } = useSprintsAnalytics(idProyecto);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={`/dashboard/proyectos/${id}/sprints`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Sprints
      </Link>

      <div className="mb-8 flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">Analítica comparativa</h1>
      </div>
      <p className="-mt-6 mb-8 text-sm text-tertiary">
        Cumplimiento y progreso de cada Sprint del proyecto, para comparar cómo avanza el equipo.
      </p>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {getApiErrorMessage(error, 'general', 'No fue posible cargar la analítica comparativa del proyecto.')}
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

      {!isLoading && !isError && sprints.length === 0 && (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Repeat aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay Sprints en este proyecto.</EmptyTitle>
            <EmptyDescription>
              Cuando se inicie un Sprint, su analítica aparecerá aquí junto con el resto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && !isError && sprints.length > 0 && <ComparativeContent sprints={sprints} />}
    </div>
  );
}
