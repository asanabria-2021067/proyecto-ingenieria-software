'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Clock,
  Flag,
  ListChecks,
  Loader2,
  Lock,
  Repeat,
  Rocket,
  type LucideIcon,
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
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';

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
  const mensaje = getApiErrorMessage(error, 'general', '');
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
    className: 'bg-status-warning text-on-status-warning',
  },
  CERRADO: { label: 'CERRADO', className: 'bg-surface-container-high text-tertiary' },
};

/** Mini-tarjeta interna de una métrica del Sprint (fecha, tareas, hitos, horas). */
function SprintMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div data-slot="sprint-metric" className="rounded-control bg-surface-container-low px-stack py-inline">
      <p className="type-meta flex items-center gap-tight text-text-secondary">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-micro text-lg font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function SprintsSkeleton() {
  return (
    <div className="flex flex-col gap-section" aria-busy="true" aria-label="Cargando Sprints">
      <div className="grid grid-cols-2 gap-grid @3xl/project:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-card" />
    </div>
  );
}

/**
 * S7 (VIEW-11): con el proyecto en `EN_SOLICITUD_CIERRE` o `CERRADO` no hay
 * escrituras sobre ningún Sprint; y un Sprint `CERRADO` es histórico para
 * todos los roles. El backend ya lo impone; aquí solo se retira la
 * affordance para no ofrecer acciones que fallarían.
 */
export function proyectoEsReadOnly(estadoProyecto: string | undefined): boolean {
  return estadoProyecto === 'EN_SOLICITUD_CIERRE' || estadoProyecto === 'CERRADO';
}

/**
 * Acciones de un Sprint, en el mismo orden siempre: Ver detalles, Analítica y
 * la acción de cierre que corresponda a su estado (solo líder y proyecto
 * escribible). Misma lógica que antes; solo cambia dónde se muestran.
 */
function SprintActions({
  sprint,
  idProyecto,
  puedeOperar,
  finalizeSprint,
}: {
  sprint: SprintDto;
  idProyecto: number;
  puedeOperar: boolean;
  finalizeSprint: ReturnType<typeof useFinalizeSprint>;
}) {
  return (
    <div data-slot="sprint-actions" className="flex shrink-0 flex-wrap items-center gap-2">
      {/* El detalle es accesible en cualquier estado del Sprint (antes solo al cerrarse). */}
      <Button
        asChild
        variant="outline"
        className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
      >
        <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}`}>Ver detalles</Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
      >
        <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}/analytics`}>
          <BarChart3 className="size-3.5" aria-hidden="true" />
          Analítica
        </Link>
      </Button>
      {sprint.estado === 'ACTIVO' && puedeOperar && (
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
      {sprint.estado === 'EN_FINALIZACION' && puedeOperar && (
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
    </div>
  );
}

function EstadoSprintBadge({ estado }: { estado: EstadoSprint }) {
  const estilo = ESTADO_SPRINT_STYLE[estado];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
    >
      {estilo.label}
    </span>
  );
}

interface SprintItemProps {
  sprint: SprintDto;
  idProyecto: number;
  isLeader: boolean;
  finalizeSprint: ReturnType<typeof useFinalizeSprint>;
  proyectoReadOnly: boolean;
}

/**
 * Sprint en curso (ACTIVO o EN_FINALIZACIÓN): bloque principal de la vista,
 * con fechas, acciones a la derecha y sus cuatro métricas en mini-tarjetas.
 */
function SprintActualCard({ sprint, idProyecto, isLeader, finalizeSprint, proyectoReadOnly }: SprintItemProps) {
  const puedeOperar = isLeader && !proyectoReadOnly;

  return (
    <article data-slot="sprint-actual" aria-labelledby={`sprint-${sprint.idSprint}-titulo`} className="card-base">
      <div className="flex flex-col gap-stack @3xl/project:flex-row @3xl/project:items-start @3xl/project:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-inline">
            <h3 id={`sprint-${sprint.idSprint}-titulo`} className="type-section text-text-primary">
              Sprint {sprint.numero}
            </h3>
            <EstadoSprintBadge estado={sprint.estado} />
          </div>
          <p className="type-meta mt-micro">
            Iniciado el {formatearFechaHora(sprint.fechaInicio)}
            {sprint.fechaFinPlaneada && ` · Fin planeado: ${formatearFechaHora(sprint.fechaFinPlaneada)}`}
            {sprint.estado === 'EN_FINALIZACION' &&
              sprint.fechaFinalizacionIniciada &&
              ` · Cierre iniciado el ${formatearFechaHora(sprint.fechaFinalizacionIniciada)}`}
          </p>
        </div>
        <SprintActions
          sprint={sprint}
          idProyecto={idProyecto}
          puedeOperar={puedeOperar}
          finalizeSprint={finalizeSprint}
        />
      </div>

      <div className="mt-card grid grid-cols-2 gap-inline @3xl/project:grid-cols-4">
        <SprintMetric icon={Calendar} label="Fecha de inicio" value={formatearFechaHora(sprint.fechaInicio)} />
        <SprintMetric icon={ListChecks} label="Tareas" value={String(sprint.tareas ?? 0)} />
        <SprintMetric icon={Flag} label="Hitos" value={String(sprint.hitos ?? 0)} />
        <SprintMetric icon={Clock} label="Horas estimadas" value={`${formatearHoras(sprint.horasEstimadas ?? 0)} h`} />
      </div>
    </article>
  );
}

/** Sprint cerrado: fila compacta del historial, con sus cifras y acciones de consulta. */
function SprintHistorialRow({ sprint, idProyecto, isLeader, finalizeSprint, proyectoReadOnly }: SprintItemProps) {
  return (
    <li
      data-slot="sprint-historial"
      className="flex flex-col gap-inline px-card py-stack @3xl/project:flex-row @3xl/project:items-center @3xl/project:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-inline">
          <h3 className="type-subtitle font-semibold text-text-primary">Sprint {sprint.numero}</h3>
          <EstadoSprintBadge estado={sprint.estado} />
        </div>
        <p className="type-meta mt-micro tabular-nums">
          {formatearFechaHora(sprint.fechaInicio)}
          {sprint.fechaCierre && ` → ${formatearFechaHora(sprint.fechaCierre)}`}
          {' · '}
          {sprint.tareas ?? 0} tareas · {sprint.hitos ?? 0} hitos · {formatearHoras(sprint.horasEstimadas ?? 0)} h estimadas
        </p>
        <p className="type-meta mt-micro flex items-center gap-1.5">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Sprint cerrado: vista histórica de solo lectura, con las horas ya acreditadas.
        </p>
      </div>
      <SprintActions
        sprint={sprint}
        idProyecto={idProyecto}
        puedeOperar={isLeader && !proyectoReadOnly}
        finalizeSprint={finalizeSprint}
      />
    </li>
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
  const proyectoReadOnly = proyectoEsReadOnly(proyecto?.estadoProyecto);
  // Vista: el Sprint en curso arriba y los cerrados como historial (mismo orden del backend).
  const enCurso = sprints.filter((sprint) => sprint.estado !== 'CERRADO');
  const cerrados = sprints.filter((sprint) => sprint.estado === 'CERRADO');
  const horasEstimadasTotales = sprints.reduce((total, sprint) => total + (sprint.horasEstimadas ?? 0), 0);

  return (
    <ProjectPageShell>
      {!cargandoProyecto && !cargandoUsuario && !isLeader ? (
        <>
          <ProjectBackLink href={volverAlProyectoHref} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder a los Sprints de este proyecto." />
        </>
      ) : (
        <>
      <ProjectPageHeader
        back={{ href: volverAlProyectoHref, label: 'Volver al proyecto' }}
        title="Sprints"
        description="Resumen de los sprints del proyecto y su progreso."
      />

      {proyectoReadOnly && (
        <p
          role="status"
          className="mb-section flex items-center gap-2 rounded-card border border-outline-variant/50 bg-surface-container-low px-card py-stack text-sm text-on-surface-variant"
        >
          <Lock className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          {proyecto?.estadoProyecto === 'CERRADO'
            ? 'El proyecto está cerrado: sus Sprints son históricos y de solo lectura.'
            : 'El proyecto está en solicitud de cierre: los Sprints no admiten cambios.'}
        </p>
      )}

      {cargando && <SprintsSkeleton />}

      {!cargando && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {getApiErrorMessage(error, 'general', 'No fue posible cargar los Sprints del proyecto.')}
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
        <div className="card-base">
          <Empty tone="flush" role="status">
            <EmptyMedia variant="subtle">
              <Repeat aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Aún no hay Sprints en este proyecto.</EmptyTitle>
              <EmptyDescription>
                Cuando se inicie un Sprint desde el tablero, aparecerá aquí junto con su progreso.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}

      {!cargando && !isError && sprints.length > 0 && (
        <div className="flex flex-col gap-section">
          {/* Resumen derivado de la misma lista (sin datos nuevos del backend). */}
          <section aria-label="Resumen de Sprints" className="grid grid-cols-1 gap-grid @xl/project:grid-cols-2 @4xl/project:grid-cols-4">
            <HoursKpiCard variante="en-linea" icon={Repeat} label="Sprints" value={String(sprints.length)} />
            <HoursKpiCard variante="en-linea" icon={Rocket} label="En curso" value={String(enCurso.length)} />
            <HoursKpiCard variante="en-linea" icon={Lock} label="Sprints cerrados" value={String(cerrados.length)} />
            <HoursKpiCard
              variante="en-linea"
              icon={Clock}
              label="Horas estimadas"
              value={`${formatearHoras(horasEstimadasTotales)} h`}
              note="Suma de todos los Sprints"
            />
          </section>

          <section aria-labelledby="sprints-en-curso-titulo" className="flex flex-col gap-stack">
            <h2 id="sprints-en-curso-titulo" className="type-section text-text-primary">
              Sprint en curso
            </h2>
            {enCurso.length === 0 ? (
              <div className="card-base">
                <Empty tone="flush">
                  <EmptyMedia variant="subtle">
                    <Rocket aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No hay un Sprint en curso.</EmptyTitle>
                    <EmptyDescription>
                      Cuando se inicie un Sprint desde el tablero, aparecerá aquí junto con su progreso.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              enCurso.map((sprint) => (
                <SprintActualCard
                  key={sprint.idSprint}
                  sprint={sprint}
                  idProyecto={idProyecto}
                  isLeader={isLeader}
                  finalizeSprint={finalizeSprint}
                  proyectoReadOnly={proyectoReadOnly}
                />
              ))
            )}
          </section>

          {cerrados.length > 0 && (
            <section aria-labelledby="sprints-historial-titulo" className="flex flex-col gap-stack">
              <div className="flex flex-wrap items-baseline justify-between gap-inline">
                <h2 id="sprints-historial-titulo" className="type-section text-text-primary">
                  Historial de Sprints
                </h2>
                <span className="type-meta">
                  {cerrados.length === 1 ? '1 Sprint cerrado' : `${cerrados.length} Sprints cerrados`}
                </span>
              </div>
              <ul className="card-base divide-y divide-outline-variant/50 overflow-hidden p-0">
                {cerrados.map((sprint) => (
                  <SprintHistorialRow
                    key={sprint.idSprint}
                    sprint={sprint}
                    idProyecto={idProyecto}
                    isLeader={isLeader}
                    finalizeSprint={finalizeSprint}
                    proyectoReadOnly={proyectoReadOnly}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
        </>
      )}
    </ProjectPageShell>
  );
}
