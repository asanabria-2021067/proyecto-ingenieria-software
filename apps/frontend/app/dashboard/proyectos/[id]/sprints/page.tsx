'use client';

import { ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, FolderX, Loader2, Repeat, Rocket, ShieldAlert } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFinalizeSprint, useProjectSprints } from '@/hooks/use-project-sprints';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
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
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
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

/** Métrica tipográfica del Sprint en curso: rótulo pequeño y cifra, sin tarjeta ni icono. */
function SprintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div data-slot="sprint-metric" className="min-w-0">
      <dt className="type-meta">{label}</dt>
      <dd className="mt-micro type-subtitle font-semibold tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

function SprintsSkeleton() {
  return (
    <SkeletonRegion label="Cargando Sprints" className="flex flex-col gap-section">
      <div className="grid grid-cols-1 gap-grid @xl/project:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-card" />
    </SkeletonRegion>
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

// Botón compacto de las bandejas (`size="sm"`): discreto para consultar, verde institucional para avanzar el cierre.
const ACCION = 'text-xs font-semibold';
const ACCION_SECUNDARIA = `${ACCION} text-text-secondary hover:text-text-primary`;
const ACCION_PRINCIPAL = `${ACCION} bg-primary text-on-primary hover:bg-primary/90`;

/**
 * Acciones de un Sprint, en el mismo orden siempre: Ver detalles, Analítica y
 * la acción de cierre que corresponda a su estado (solo líder y proyecto
 * escribible). Las de consulta son secundarias; la de cierre es la principal.
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
    <div data-slot="sprint-actions" className="-ml-3 flex shrink-0 flex-wrap items-center gap-tight @3xl/project:ml-0">
      {/* -ml-3 en estrecho: el texto del primer botón «ghost» se alinea con el contenido de arriba.
          El detalle es accesible en cualquier estado del Sprint (antes solo al cerrarse). */}
      <Button asChild variant="ghost" size="sm" className={ACCION_SECUNDARIA}>
        <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}`}>Ver detalles</Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className={ACCION_SECUNDARIA}>
        <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}/analytics`}>Analítica</Link>
      </Button>
      {sprint.estado === 'ACTIVO' && puedeOperar && (
        <Button
          type="button"
          size="sm"
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
          className={ACCION_PRINCIPAL}
        >
          {finalizeSprint.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {finalizeSprint.isPending ? 'Finalizando...' : 'Finalizar'}
        </Button>
      )}
      {sprint.estado === 'EN_FINALIZACION' && puedeOperar && (
        <Button asChild size="sm" className={ACCION_PRINCIPAL}>
          <Link href={`/dashboard/proyectos/${idProyecto}/sprints/${sprint.idSprint}/finalizar`}>Continuar cierre</Link>
        </Button>
      )}
    </div>
  );
}

function EstadoSprintBadge({ estado }: { estado: EstadoSprint }) {
  const estilo = ESTADO_SPRINT_STYLE[estado];
  return <span className={`pill ${estilo.className}`}>{estilo.label}</span>;
}

interface SprintItemProps {
  sprint: SprintDto;
  idProyecto: number;
  isLeader: boolean;
  finalizeSprint: ReturnType<typeof useFinalizeSprint>;
  proyectoReadOnly: boolean;
}

/**
 * Sprint en curso (ACTIVO o EN_FINALIZACIÓN): bloque principal de la vista.
 * Una sola superficie: título, estado y acciones arriba; debajo, las fechas
 * y cifras como métricas tipográficas separadas por una línea tenue.
 */
function SprintActualCard({ sprint, idProyecto, isLeader, finalizeSprint, proyectoReadOnly }: SprintItemProps) {
  const puedeOperar = isLeader && !proyectoReadOnly;
  const cierreIniciado = sprint.estado === 'EN_FINALIZACION' ? sprint.fechaFinalizacionIniciada : null;

  return (
    <article data-slot="sprint-actual" aria-labelledby={`sprint-${sprint.idSprint}-titulo`} className="card-base">
      <div className="flex flex-col gap-stack @3xl/project:flex-row @3xl/project:items-center @3xl/project:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-inline">
            <h3 id={`sprint-${sprint.idSprint}-titulo`} className="type-section text-text-primary">
              Sprint {sprint.numero}
            </h3>
            <EstadoSprintBadge estado={sprint.estado} />
          </div>
          {cierreIniciado && <p className="type-meta mt-micro">Cierre iniciado el {formatearFechaHora(cierreIniciado)}</p>}
        </div>
        <SprintActions
          sprint={sprint}
          idProyecto={idProyecto}
          puedeOperar={puedeOperar}
          finalizeSprint={finalizeSprint}
        />
      </div>

      <dl className="mt-stack grid grid-cols-2 gap-x-card gap-y-stack border-t border-outline-variant/50 pt-stack @2xl/project:grid-cols-5">
        <SprintMetric label="Inicio" value={formatearFechaHora(sprint.fechaInicio)} />
        <SprintMetric
          label="Fin planeado"
          value={sprint.fechaFinPlaneada ? formatearFechaHora(sprint.fechaFinPlaneada) : 'Sin fecha'}
        />
        <SprintMetric label="Tareas" value={String(sprint.tareas ?? 0)} />
        <SprintMetric label="Hitos" value={String(sprint.hitos ?? 0)} />
        <SprintMetric label="Horas estimadas" value={`${formatearHoras(sprint.horasEstimadas ?? 0)} h`} />
      </dl>
    </article>
  );
}

/** Sprint cerrado: fila compacta del historial, con sus fechas, cifras y acciones de consulta. */
function SprintHistorialRow({ sprint, idProyecto, isLeader, finalizeSprint, proyectoReadOnly }: SprintItemProps) {
  return (
    <li
      data-slot="sprint-historial"
      className="flex flex-col gap-tight px-card py-inline transition-colors hover:bg-surface-container-low @3xl/project:flex-row @3xl/project:items-center @3xl/project:justify-between"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-inline gap-y-micro">
        <h3 className="type-body font-semibold text-text-primary">Sprint {sprint.numero}</h3>
        <EstadoSprintBadge estado={sprint.estado} />
        <p className="type-meta tabular-nums">
          {formatearFechaHora(sprint.fechaInicio)}
          {sprint.fechaCierre && ` → ${formatearFechaHora(sprint.fechaCierre)}`}
          {' · '}
          {sprint.tareas ?? 0} tareas · {sprint.hitos ?? 0} hitos · {formatearHoras(sprint.horasEstimadas ?? 0)} h estimadas
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

  const {
    data: proyecto,
    isLoading: cargandoProyecto,
    isError: errorDeProyecto,
    error: causaErrorProyecto,
    refetch: recargarProyecto,
  } = useProjectDetail(idProyecto);
  // GPI01-C05 (H-03): sin proyecto no hay forma de saber quién es líder. Antes
  // cualquier fallo de esta lectura acababa en «no eres líder», también para un
  // proyecto inexistente o un error del servidor.
  const estadoErrorProyecto = errorDeProyecto ? getApiErrorStatus(causaErrorProyecto) : undefined;
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

  if (errorDeProyecto) {
    const sinAcceso = estadoErrorProyecto === 403;
    const terminal = sinAcceso || estadoErrorProyecto === 404;
    return (
      <ProjectPageShell>
        <Empty tone={terminal ? 'muted' : 'danger'} role={terminal ? 'status' : 'alert'}>
          <EmptyMedia variant="icon">
            {sinAcceso ? (
              <ShieldAlert aria-hidden="true" className="h-7 w-7" />
            ) : terminal ? (
              <FolderX aria-hidden="true" className="h-7 w-7" />
            ) : (
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            )}
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {sinAcceso
                ? 'No tienes acceso a este proyecto.'
                : terminal
                  ? 'Proyecto no encontrado'
                  : 'No fue posible cargar el proyecto.'}
            </EmptyTitle>
            <EmptyDescription>
              {sinAcceso
                ? 'Solo quienes participan en el proyecto pueden consultar sus Sprints.'
                : terminal
                  ? 'El proyecto que buscas no existe o ya no está disponible.'
                  : 'Inténtalo de nuevo en unos segundos.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {terminal ? (
              <Link
                href="/dashboard/proyectos"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Volver a proyectos
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => recargarProyecto()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Reintentar
              </button>
            )}
          </EmptyContent>
        </Empty>
      </ProjectPageShell>
    );
  }

  // Un 403/404 de la lista tampoco cambia por repetirlo: sin botón de reintento.
  const estadoErrorSprints = isError ? getApiErrorStatus(error) : undefined;
  const errorSprintsTerminal = estadoErrorSprints === 403 || estadoErrorSprints === 404;

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
          className="type-body mb-section rounded-card border border-outline-variant/50 bg-surface-container-low px-card py-inline text-text-secondary"
        >
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
          {!errorSprintsTerminal && (
            <EmptyContent>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Reintentar
              </button>
            </EmptyContent>
          )}
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
          <section aria-label="Resumen de Sprints" className="grid grid-cols-1 gap-grid @xl/project:grid-cols-3">
            <HoursKpiCard variante="en-linea" label="Sprints totales" value={String(sprints.length)} />
            <HoursKpiCard variante="en-linea" label="En curso" value={String(enCurso.length)} />
            <HoursKpiCard
              variante="en-linea"
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
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-inline">
                  <h2 id="sprints-historial-titulo" className="type-section text-text-primary">
                    Historial de Sprints
                  </h2>
                  <span className="type-meta tabular-nums">
                    {cerrados.length === 1 ? '1 Sprint cerrado' : `${cerrados.length} Sprints cerrados`}
                  </span>
                </div>
                {/* Antes se repetía en cada fila; se dice una vez para todo el historial. */}
                <p className="type-meta mt-micro">Vista histórica de solo lectura, con las horas ya acreditadas.</p>
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
