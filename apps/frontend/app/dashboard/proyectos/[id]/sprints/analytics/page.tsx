'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Repeat } from 'lucide-react';
import { useSprintsAnalytics, useSprintBurndown } from '@/hooks/use-project-sprints';
import { ProjectExportButtons } from '@/components/projects/project-export-buttons';
import { BurndownChart } from '@/components/projects/burndown-chart';
import { VelocityChart } from '@/components/projects/velocity-chart';
import { ReportsDialogTrigger, SprintReportsDialog } from '@/components/projects/sprint-reports-dialog';
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
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/** El Sprint mas relevante para la vista previa de burndown: el operable
 * (ACTIVO/EN_FINALIZACION) si hay uno, si no el CERRADO mas reciente por
 * numero. `null` si el proyecto aun no tiene ningun Sprint. */
function sprintMasReciente(sprints: SprintComparativeAnalyticsItemDto[]): SprintComparativeAnalyticsItemDto | null {
  const operable = sprints.find((s) => s.estado === 'ACTIVO' || s.estado === 'EN_FINALIZACION');
  if (operable) return operable;
  const cerrados = sprints.filter((s) => s.estado === 'CERRADO').sort((a, b) => b.numero - a.numero);
  return cerrados[0] ?? null;
}

/** Mismo criterio "exhaustivo por diseño" que `ESTADO_SPRINT_STYLE` en `sprints/page.tsx`/`sprints/[sprintId]/page.tsx`. */
const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'Activo', className: 'bg-primary-container text-on-primary-container' },
  EN_FINALIZACION: {
    label: 'En finalización',
    className: 'bg-status-warning text-on-status-warning',
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
 * T-241 (HU-160): velocidad — la métrica PRINCIPAL de la comparativa, en
 * story points, solo para Sprints `CERRADO` (la velocidad se alimenta del
 * congelado de T-239, nunca del estado actual). `VelocityChart` ya excluye
 * del promedio los Sprints "sin puntos asignados".
 */
function SeccionVelocidad({ sprints }: { sprints: SprintComparativeAnalyticsItemDto[] }) {
  return (
    <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-bold text-on-surface">Velocidad (story points completados)</h2>
      <p className="mb-4 text-xs text-tertiary">
        Story points completados por Sprint cerrado. El promedio es la referencia para comprometer el siguiente
        Sprint.
      </p>
      <VelocityChart sprints={sprints} />
    </div>
  );
}

/** Vista previa del burndown del Sprint mas relevante, directo en la
 * comparativa — sin tener que exportar ni navegar a otra pantalla primero. */
function SeccionBurndownPreview({ idProyecto, sprint }: { idProyecto: number; sprint: SprintComparativeAnalyticsItemDto }) {
  const { burndown, isLoading, isError } = useSprintBurndown(idProyecto, sprint.idSprint);

  if (isLoading) return <Skeleton className="mb-6 h-[340px] w-full rounded-xl" />;
  if (isError || !burndown) return null;

  return (
    <div className="mb-6">
      <BurndownChart burndown={burndown} />
    </div>
  );
}

function ComparativeContent({ idProyecto, sprints }: { idProyecto: number; sprints: SprintComparativeAnalyticsItemDto[] }) {
  const maximoTareasCompletadas = Math.max(1, ...sprints.map((sprint) => sprint.tareasCompletadas));
  const sprintPreview = sprintMasReciente(sprints);

  return (
    <>
      {sprintPreview && <SeccionBurndownPreview idProyecto={idProyecto} sprint={sprintPreview} />}
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
  const [informesAbierto, setInformesAbierto] = useState(false);

  const { sprints, isLoading, isError, error, refetch } = useSprintsAnalytics(idProyecto);
  const sprintParaInformes = sprintMasReciente(sprints);

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints`, label: 'Volver a Sprints' }}
        title="Analítica comparativa"
        description="Cumplimiento y progreso de cada Sprint del proyecto, para comparar cómo avanza el equipo."
        actions={
          <div className="flex items-center gap-2">
            <ProjectExportButtons idProyecto={idProyecto} />
            <ReportsDialogTrigger onClick={() => setInformesAbierto(true)} />
          </div>
        }
      />
      <SprintReportsDialog
        open={informesAbierto}
        onOpenChange={setInformesAbierto}
        idProyecto={idProyecto}
        idSprintBurndown={sprintParaInformes?.idSprint ?? null}
      />

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

      {!isLoading && !isError && sprints.length > 0 && (
        <ComparativeContent idProyecto={idProyecto} sprints={sprints} />
      )}
    </ProjectPageShell>
  );
}