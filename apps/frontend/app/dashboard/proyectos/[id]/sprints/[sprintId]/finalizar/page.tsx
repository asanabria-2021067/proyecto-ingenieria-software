'use client';

import { ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ChevronRight, Flag, Loader2 } from 'lucide-react';
import { useCloseSprint, useProjectSprints, useSprintClosingSummary, useSprintDetail } from '@/hooks/use-project-sprints';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { SprintCloseConfirmModal } from '@/components/projects/sprint-close-confirm-modal';
import { formatearDecimal } from '@/components/hours/hour-adjustment-row';
import { SIN_TOTALES, getInitials, sumarDecimales } from '@/components/hours/sprint-closing.shared';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { aviso } from '@/lib/mensajes';
import { sprintClosingSummaryQueryKey } from '@/lib/query-keys/sprints';
import type { SprintClosingSummaryParticipantDto, DestinoArrastre, EstadoSprint } from '@/lib/types/sprints';


/**
 * Columnas del listado de integrantes: el encabezado y cada fila usan la
 * misma rejilla, así Reportadas y Propuestas quedan alineadas entre filas.
 */
const COLUMNAS_INTEGRANTE =
  'grid grid-cols-2 items-center gap-x-4 gap-y-2 @3xl/project:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7rem_7rem]';

/** Rótulo de columna de la tabla compartida (`data-table`), igual que Miembros y las bandejas. */
const COLUMNA_TITULO = DATA_TABLE_HEAD_TEXT;

function mensajeDeError(error: unknown): string {
  return getApiErrorMessage(error, 'general');
}

function ClosingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-4 @3xl/project:grid-cols-4">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

/**
 * Fila compacta de un integrante: nombre, rol y sus dos totales del backend.
 * Toda la fila lleva a la revisión de horas con ese integrante ya elegido; el
 * desglose por tarea y tramo, los ajustes y el historial viven allí.
 */
function MemberRow({ participante, revisionHref }: { participante: SprintClosingSummaryParticipantDto; revisionHref: string }) {
  const totales = participante.totales ?? SIN_TOTALES;
  const nombre = `${participante.nombre} ${participante.apellido}`;

  return (
    <li className={`border-b ${DATA_TABLE_ROW_BORDER} last:border-b-0`}>
      <Link
        href={`${revisionHref}?integrante=${participante.idUsuario}`}
        aria-label={`Revisar horas de ${nombre}`}
        className={`flex items-center gap-4 px-stack py-inline outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${DATA_TABLE_ROW_HOVER}`}
      >
        <div className={`${COLUMNAS_INTEGRANTE} min-w-0 flex-1`}>
          <span className="col-span-2 flex min-w-0 items-center gap-tight @3xl/project:col-span-1">
            <Avatar className="size-8 shrink-0">
              {participante.fotoUrl && <AvatarImage src={participante.fotoUrl} alt="" />}
              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                {getInitials(participante.nombre, participante.apellido)}
              </AvatarFallback>
            </Avatar>
            <span className="type-body truncate font-semibold text-text-primary">{nombre}</span>
          </span>
          <span className="col-span-2 flex flex-wrap gap-1 @3xl/project:col-span-1">
            {participante.roles.map((rol) => (
              <span key={rol.idRolProyecto} className="pill pill-sm pill-sage">
                {rol.nombreRol}
              </span>
            ))}
          </span>
          <span className="flex flex-col">
            {/* En escritorio el encabezado de la tabla ya nombra la columna. */}
            <span className={`${COLUMNA_TITULO} @3xl/project:hidden`}>Reportadas</span>
            <span className="type-body font-semibold tabular-nums text-text-primary">
              {formatearDecimal(totales.reportadas)} h
            </span>
          </span>
          <span className="flex flex-col">
            <span className={`${COLUMNA_TITULO} @3xl/project:hidden`}>Propuestas</span>
            <span className="type-body font-semibold tabular-nums text-primary">
              {formatearDecimal(totales.propuestas)} h
            </span>
          </span>
        </div>
        <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function SprintClosingPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { summary, isLoading, isError, error, refetch } = useSprintClosingSummary(idProyecto, idSprint);
  const { sprints } = useProjectSprints(idProyecto);
  const closeSprint = useCloseSprint(idProyecto);
  const { detail: sprintDetail } = useSprintDetail(idProyecto, idSprint);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const volverHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;
  const revisionHref = `/dashboard/proyectos/${id}/sprints/${sprintId}/finalizar/revision`;

  const sprint = sprints.find((s) => s.idSprint === idSprint) ?? null;
  const tareasPendientes = (sprintDetail?.tareas ?? []).filter((t) => t.estadoTarea !== 'HECHO');
  const estadoSprint = summary?.estadoSprint ?? sprint?.estado ?? null;
  const readOnly = estadoSprint === 'CERRADO' || estadoSprint === 'ACTIVO';
  const blockers = summary?.blockers ?? [];

  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const kpis = useMemo(() => {
    const participantes = summary?.participantes ?? [];
    const totales = participantes.map((p) => p.totales ?? SIN_TOTALES);
    const tareas = new Set<number>();
    for (const t of totales) for (const tramo of t.tramos) tareas.add(tramo.idTarea);
    return {
      integrantes: participantes.length,
      tareasDistintas: tareas.size,
      reportadas: sumarDecimales(totales.map((t) => t.reportadas)),
      exceso: sumarDecimales(totales.map((t) => t.exceso)),
      propuestas: sumarDecimales(totales.map((t) => t.propuestas)),
    };
  }, [summary]);

  const ejecutarCierre = async (destino?: DestinoArrastre) => {
    setCloseError(null);
    setClosing(true);
    try {
      await closeSprint.mutateAsync({ idSprint, destino });
      queryClient.invalidateQueries({ queryKey: sprintClosingSummaryQueryKey(idProyecto, idSprint) });
      aviso.exito('Sprint cerrado', 'Las horas propuestas quedaron acreditadas y forman parte del historial del proyecto.');
      router.push(`/dashboard/projects/${idProyecto}`);
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 409) {
        refetch();
        setCloseError(
          `${mensajeDeError(err)} Se actualizo el resumen; revisa los bloqueos antes de volver a intentarlo.`,
        );
      } else {
        setCloseError(getApiErrorMessage(err, 'hours'));
      }
      setClosing(false);
    }
  };

  const handleClickCerrar = () => {
    if (tareasPendientes.length > 0) {
      setShowCloseModal(true);
      return;
    }
    void ejecutarCierre();
  };

  // Los ajustes de horas se hacen en la vista de revisión: aquí no puede haber uno en curso.
  const puedeCerrar = !readOnly && blockers.length === 0 && !closing;
  const motivoNoCerrar = readOnly
    ? estadoSprint === 'CERRADO'
      ? 'Este Sprint ya esta cerrado.'
      : 'El Sprint debe estar en finalizacion para cerrarlo.'
    : blockers.length > 0
      ? `Hay ${blockers.length} ${blockers.length === 1 ? 'bloqueo' : 'bloqueos'} pendientes: ${blockers
          .map((b) => b.message)
          .join(' - ')}`
      : 'El cierre se está confirmando.';

  const botonCerrar = (
    <Button
      type="button"
      onClick={handleClickCerrar}
      disabled={!puedeCerrar}
      className="h-10 w-full gap-1.5 rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90 disabled:bg-surface-container-high disabled:text-text-secondary disabled:opacity-100 sm:w-auto"
    >
      {closing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {closing ? 'Confirmando cierre...' : 'Confirmar cierre del Sprint'}
    </Button>
  );

  // Igual que antes: cualquier estado que no sea cierre ni finalización se muestra como «Activo».
  const estiloEstado = estadoSprint
    ? (ESTADO_SPRINT_STYLE[estadoSprint as EstadoSprint] ?? ESTADO_SPRINT_STYLE.ACTIVO)
    : null;
  const hayExceso = Number(kpis.exceso) > 0;

  if (!cargandoProyecto && !cargandoUsuario && !isLeader) {
    return (
      <ProjectPageShell>
        <ProjectBackLink href={volverHref} label="Volver al proyecto" className="mb-card" />
        <LeaderOnlyNotice description="No puedes acceder al cierre de este Sprint." />
      </ProjectPageShell>
    );
  }

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints`, label: 'Volver a Sprints' }}
        title={sprint ? `Cerrar Sprint ${sprint.numero}` : 'Cierre de Sprint'}
        description={
          readOnly && estadoSprint === 'CERRADO'
            ? 'Este Sprint ya fue cerrado: las horas acreditadas se muestran en solo lectura.'
            : 'Revisión final de horas y contribuciones antes de confirmar el cierre.'
        }
        actions={
          estiloEstado && (
            <span
              className={`pill ${estiloEstado.className}`}
            >
              {estiloEstado.label}
            </span>
          )
        }
      />

      {isLoading && <ClosingSkeleton />}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{mensajeDeError(error) || 'No fue posible cargar el resumen de cierre.'}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => refetch()} className="rounded-xl px-5 text-sm font-bold">
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && summary && (
        <>
          <div className="space-y-section">
            <div data-slot="closing-kpis" className="grid grid-cols-2 gap-4 @3xl/project:grid-cols-4">
              <HoursKpiCard
                variante="en-linea"
                label="Integrantes"
                value={String(kpis.integrantes)}
                note={kpis.tareasDistintas === 1 ? '1 tarea distinta' : `${kpis.tareasDistintas} tareas distintas`}
              />
              <HoursKpiCard variante="en-linea" label="Horas reportadas" value={`${formatearDecimal(kpis.reportadas)} h`} />
              <HoursKpiCard
                variante="en-linea"
                label="Exceso sobre estimación"
                value={`${formatearDecimal(kpis.exceso)} h`}
                tono={hayExceso ? 'atencion' : 'neutro'}
              />
              <HoursKpiCard variante="en-linea" label="Horas propuestas" value={`${formatearDecimal(kpis.propuestas)} h`} />
            </div>

            {blockers.length > 0 && (
              <Alert variant="attention">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>El Sprint aún no puede cerrarse</AlertTitle>
                <AlertDescription className="text-text-primary">
                  <ul className="list-disc space-y-1 pl-5">
                    {blockers.map((b) => (
                      <li key={b.code}>
                        {b.message}
                        {b.cantidad > 0 && <span className="text-xs"> ({b.cantidad})</span>}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <section aria-labelledby="horas-integrantes">
              <div className="mb-stack flex flex-col gap-inline @2xl/project:flex-row @2xl/project:items-end @2xl/project:justify-between">
                <div className="min-w-0">
                  <h2 id="horas-integrantes" className="type-section">
                    Horas por integrante
                  </h2>
                  <p className="type-body mt-micro text-text-secondary">
                    Totales reportados y propuestos. El desglose por tarea y tramo, los ajustes y el historial están en la revisión de horas.
                  </p>
                </div>
                {summary.participantes.length > 0 && (
                  <Button asChild variant="outline" size="sm" className="shrink-0 text-xs font-semibold">
                    <Link href={revisionHref}>Revisar horas</Link>
                  </Button>
                )}
              </div>

              {summary.participantes.length === 0 ? (
                <Empty role="status">
                  <EmptyMedia variant="icon">
                    <Flag aria-hidden="true" className="h-7 w-7" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Este Sprint no tiene contribuciones registradas.</EmptyTitle>
                    <EmptyDescription>
                      No hay participantes con tareas u horas asociadas a este Sprint todavia.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div data-slot="horas-integrantes" className={DATA_TABLE_CARD}>
                  {/* pr-12: deja el hueco del chevron (gap-4 + size-4) de cada fila. */}
                  <div
                    aria-hidden="true"
                    className={`${COLUMNAS_INTEGRANTE} ${DATA_TABLE_HEAD_ROW} hidden py-tight pl-stack pr-12 @3xl/project:grid`}
                  >
                    <span className={COLUMNA_TITULO}>Integrante</span>
                    <span className={COLUMNA_TITULO}>Rol</span>
                    <span className={COLUMNA_TITULO}>Reportadas</span>
                    <span className={COLUMNA_TITULO}>Propuestas</span>
                  </div>
                  <ul>
                    {summary.participantes.map((participante) => (
                      <MemberRow key={participante.idUsuario} participante={participante} revisionHref={revisionHref} />
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {closeError && (
              <p role="alert" className="text-sm font-medium text-error">
                {closeError}
              </p>
            )}
          </div>

          <div
            data-slot="closing-actions"
            className="mb-16 mt-section flex flex-col-reverse gap-2 border-t border-outline-variant/40 pt-card sm:flex-row sm:items-center sm:justify-between"
          >
            <Button asChild variant="outline" className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto">
              <Link href={volverHref}>Cancelar</Link>
            </Button>
            {puedeCerrar ? (
              botonCerrar
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex w-full cursor-not-allowed rounded-lg sm:w-auto">
                    {botonCerrar}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{motivoNoCerrar}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </>
      )}

      <SprintCloseConfirmModal
        open={showCloseModal}
        onOpenChange={setShowCloseModal}
        tareasPendientes={tareasPendientes.map((t) => ({ idTarea: t.idTarea, tituloTarea: t.tituloTarea }))}
        isPending={closing}
        onConfirm={(destino) => {
          setShowCloseModal(false);
          void ejecutarCierre(destino);
        }}
      />
    </ProjectPageShell>
  );
}
