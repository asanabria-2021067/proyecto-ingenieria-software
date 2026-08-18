'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  Flag,
  History,
  ListChecks,
  Loader2,
  Repeat,
} from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFinalizeSprint, useProjectSprints } from '@/hooks/use-project-sprints';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import uvgSwal from '@/lib/swal';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { EstadoSprint, SprintDto } from '@/lib/types/sprints';

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function mensajeErrorFinalizarSprint(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : '';
  if (/tareas pendientes/i.test(mensaje)) {
    return 'Aún quedan tareas por realizar. Completa o cierra las tareas pendientes antes de finalizar el Sprint.';
  }
  return mensaje || 'No fue posible finalizar el Sprint. Intenta nuevamente.';
}

/**
 * Estados de Sprint centralizados (mismo criterio `statusConfig` manual que
 * `ESTADO_SPRINT_STYLE` en `sprints/[sprintId]/page.tsx`, F4 — no exportado
 * allí, así que se repite localmente en vez de importar entre páginas
 * congeladas). Exhaustivo por diseño: un `EstadoSprint` nuevo rompe la
 * compilación en vez de caer silenciosamente en un estado incorrecto.
 */
const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'ACTIVO', className: 'bg-primary-container text-on-primary-container' },
  EN_FINALIZACION: {
    label: 'EN FINALIZACIÓN',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  CERRADO: { label: 'CERRADO', className: 'bg-surface-container-high text-tertiary' },
};

function MetricBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
        <Icon className="size-4 text-tertiary" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[11px] font-semibold text-tertiary">{label}</p>
        <p className="text-sm font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function SprintCardSkeleton() {
  return <Skeleton className="h-40 w-full rounded-xl" />;
}

function SprintCard({
  sprint,
  idProyecto,
  isLeader,
  finalizeSprint,
}: {
  sprint: SprintDto;
  idProyecto: number;
  isLeader: boolean;
  finalizeSprint: ReturnType<typeof useFinalizeSprint>;
}) {
  const estilo = ESTADO_SPRINT_STYLE[sprint.estado];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Repeat className="size-5 text-primary" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-bold text-on-surface">Sprint {sprint.numero}</h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
          >
            {estilo.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center">
          {sprint.estado === 'ACTIVO' && isLeader && (
            <Button
              type="button"
              onClick={() =>
                finalizeSprint.mutate(sprint.idSprint, {
                  onError: (error) => {
                    void uvgSwal.fire({
                      icon: 'warning',
                      title: 'No se puede finalizar el Sprint',
                      text: mensajeErrorFinalizarSprint(error),
                    });
                  },
                })
              }
              disabled={finalizeSprint.isPending}
              className="gap-1.5 rounded-lg bg-primary px-5 text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              {finalizeSprint.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {finalizeSprint.isPending ? 'Finalizando...' : 'Finalizar'}
            </Button>
          )}
          {sprint.estado === 'EN_FINALIZACION' && isLeader && (
            <Button
              asChild
              variant="outline"
              className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
            >
              <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}/finalizar`}>
                Continuar cierre
              </Link>
            </Button>
          )}
          {sprint.estado === 'CERRADO' && (
            <Button
              asChild
              variant="outline"
              className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
            >
              <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}`}>Ver Detalles</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-outline-variant/30 pt-4 lg:grid-cols-4">
        <MetricBlock icon={Calendar} label="Fecha de inicio" value={formatearFechaHora(sprint.fechaInicio)} />
        <MetricBlock icon={ListChecks} label="Tareas" value={String(sprint.tareas ?? 0)} />
        <MetricBlock icon={Flag} label="Hitos" value={String(sprint.hitos ?? 0)} />
        <MetricBlock
          icon={Clock}
          label="Horas estimadas"
          value={`${formatearHoras(sprint.horasEstimadas ?? 0)} h`}
        />
      </div>
    </div>
  );
}

export default function SprintListPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;

  const { sprints, isLoading, isError, error, refetch } = useProjectSprints(idProyecto);
  const finalizeSprint = useFinalizeSprint(idProyecto);

  const cargando = isLoading || cargandoProyecto || cargandoUsuario;
  const volverAlProyectoHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={volverAlProyectoHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {!cargandoProyecto && !cargandoUsuario && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder a los Sprints de este proyecto." />
      ) : (
        <>
      <div className="mb-8 flex items-center gap-2">
        <History className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">Sprints</h1>
      </div>
      <p className="-mt-6 mb-8 text-sm text-tertiary">Resumen de los sprints del proyecto y su progreso.</p>

      {cargando && (
        <div className="space-y-4">
          <SprintCardSkeleton />
          <SprintCardSkeleton />
          <SprintCardSkeleton />
        </div>
      )}

      {!cargando && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {error instanceof Error && error.message
                ? error.message
                : 'No fue posible cargar los Sprints del proyecto.'}
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

      {!cargando && !isError && sprints.length === 0 && (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Repeat aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay Sprints en este proyecto.</EmptyTitle>
            <EmptyDescription>
              Cuando se inicie un Sprint desde el tablero, aparecerá aquí junto con su progreso.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!cargando && !isError && sprints.length > 0 && (
        <div className="space-y-4">
          {sprints.map((sprint) => (
            <SprintCard
              key={sprint.idSprint}
              sprint={sprint}
              idProyecto={idProyecto}
              isLeader={isLeader}
              finalizeSprint={finalizeSprint}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
