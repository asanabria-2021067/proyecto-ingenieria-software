'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  Loader2,
} from 'lucide-react';
import { useCloseSprint, useProjectSprints, useSprintClosingSummary } from '@/hooks/use-project-sprints';
import { useHourAdjustments } from '@/hooks/use-hour-adjustments';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { HourAdjustmentRow, formatearDecimal } from '@/components/hours/hour-adjustment-row';
import { getApiErrorMessage, getApiErrorStatus, isProyectoOcupado } from '@/components/projects/api-error';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import uvgSwal from '@/lib/swal';
import { sprintClosingSummaryQueryKey } from '@/lib/query-keys/sprints';
import type {
  SprintClosingMemberTotalsDto,
  SprintClosingSummaryParticipantDto,
  SprintClosingTramoDto,
  UpsertHourAdjustmentInput,
} from '@/lib/types/sprints';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}

/** Suma importes decimales (string) en centésimas enteras y devuelve un string decimal. */
function sumarDecimales(valores: string[]): string {
  const total = valores.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  const signo = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const SIN_TOTALES: SprintClosingMemberTotalsDto = {
  tareasDistintas: 0,
  estimacionAsociada: null,
  reportadas: '0.00',
  legacy: '0.00',
  exceso: '0.00',
  propuestas: '0.00',
  filasPendientes: 0,
  filasConsumidas: 0,
  tramos: [],
};

function ClosingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  const warning = tone === 'warning';
  return (
    <div role="group" aria-label={label} className={`${CARD} flex items-center gap-3 p-4`}>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          warning ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary'
        }`}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-tertiary">{label}</p>
        <p className={`text-xl font-bold leading-tight ${warning ? 'text-amber-700 dark:text-amber-300' : 'text-on-surface'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Integrante (acordeón) ───────────────────────────────────────────────────
function MemberItem({
  participante,
  readOnly,
  pendingId,
  errors,
  onUpsert,
  onRevert,
  onLoadHistory,
}: {
  participante: SprintClosingSummaryParticipantDto;
  readOnly: boolean;
  pendingId: number | null;
  errors: Record<number, string>;
  onUpsert: (idAsignacion: number, input: UpsertHourAdjustmentInput) => void;
  onRevert: (idAsignacion: number) => void;
  onLoadHistory: (idAsignacion: number) => Promise<import('@/lib/types/sprints').AjusteHoraDTO[]>;
}) {
  const totales = participante.totales ?? SIN_TOTALES;
  const rolPorParticipacion = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of participante.participaciones) map.set(p.idParticipacion, p.nombreRol);
    return map;
  }, [participante.participaciones]);

  // rol → tarea → tramos
  const arbol = useMemo(() => {
    const porRol = new Map<string, Map<number, { titulo: string; tramos: SprintClosingTramoDto[] }>>();
    for (const tramo of totales.tramos) {
      const rol =
        (tramo.idParticipacion != null ? rolPorParticipacion.get(tramo.idParticipacion) : undefined) ??
        'Sin rol vigente';
      const tareas = porRol.get(rol) ?? new Map();
      const entrada = tareas.get(tramo.idTarea) ?? { titulo: tramo.tituloTarea, tramos: [] };
      entrada.tramos.push(tramo);
      tareas.set(tramo.idTarea, entrada);
      porRol.set(rol, tareas);
    }
    return porRol;
  }, [totales.tramos, rolPorParticipacion]);

  const nombre = `${participante.nombre} ${participante.apellido}`;

  return (
    <AccordionItem value={String(participante.idUsuario)} className={`${CARD} mb-3 border-b p-0`}>
      <AccordionTrigger className="px-5 py-4 hover:no-underline" aria-label={`Desglose de ${nombre}`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <Avatar className="size-9 shrink-0">
            {participante.fotoUrl && <AvatarImage src={participante.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary text-xs font-bold text-on-primary">
              {getInitials(participante.nombre, participante.apellido)}
            </AvatarFallback>
          </Avatar>
          <span className="text-base font-bold text-on-surface">{nombre}</span>
          <span className="flex flex-wrap gap-1">
            {participante.roles.map((rol) => (
              <Badge key={rol.idRolProyecto} className="border-transparent bg-primary/10 text-[11px] font-semibold text-primary">
                {rol.nombreRol}
              </Badge>
            ))}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary">
            <span>
              Total reportadas{' '}
              <Badge variant="outline" className="ml-1 text-xs font-bold text-on-surface">
                {formatearDecimal(totales.reportadas)} h
              </Badge>
            </span>
            <span>
              Total propuestas{' '}
              <Badge className="ml-1 border-transparent bg-primary/10 text-xs font-bold text-primary">
                {formatearDecimal(totales.propuestas)} h
              </Badge>
            </span>
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5">
        {totales.tramos.length === 0 ? (
          <p className="text-sm italic text-tertiary">Este integrante no tiene tramos de horas en el Sprint.</p>
        ) : (
          <div className="space-y-4">
            {[...arbol.entries()].map(([rol, tareas]) => (
              <section key={rol} aria-label={`Rol ${rol}`} className="space-y-3">
                <h3 className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-sm font-semibold text-primary">
                  <FileText className="size-4" aria-hidden="true" />
                  {rol}
                </h3>
                {[...tareas.entries()].map(([idTarea, tarea]) => (
                  <div key={idTarea} className="space-y-2 pl-2 sm:pl-4">
                    <h4 className="flex items-center gap-2 rounded-md border border-outline-variant/30 px-3 py-2 text-sm font-medium text-on-surface">
                      <ClipboardList className="size-4 text-tertiary" aria-hidden="true" />
                      Tarea: {tarea.titulo}
                    </h4>
                    <div className="space-y-2 pl-1 sm:pl-3">
                      {tarea.tramos.map((tramo, index) => (
                        <HourAdjustmentRow
                          key={tramo.idAsignacion}
                          tramo={tramo}
                          indice={index + 1}
                          disabled={readOnly}
                          pending={pendingId === tramo.idAsignacion}
                          error={errors[tramo.idAsignacion] ?? null}
                          onUpsert={onUpsert}
                          onRevert={onRevert}
                          onLoadHistory={onLoadHistory}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function SprintClosingPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { summary, isLoading, isError, error, refetch } = useSprintClosingSummary(idProyecto, idSprint);
  const { sprints } = useProjectSprints(idProyecto);
  const closeSprint = useCloseSprint(idProyecto);
  const { upsert, revert, history } = useHourAdjustments(idProyecto, idSprint);

  // GET .../resumen-cierre es exclusivo del líder en backend
  // (assertCanViewClosingSummary). Mismo criterio de detección client-side
  // que el resto de proyectos/[id]/*.
  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const volverHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;

  const sprint = sprints.find((s) => s.idSprint === idSprint) ?? null;
  const estadoSprint = summary?.estadoSprint ?? sprint?.estado ?? null;
  const readOnly = estadoSprint === 'CERRADO' || estadoSprint === 'ACTIVO';
  const blockers = summary?.blockers ?? [];

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const kpis = useMemo(() => {
    const participantes = summary?.participantes ?? [];
    const totales = participantes.map((p) => p.totales ?? SIN_TOTALES);
    const tareas = new Set<number>();
    for (const t of totales) for (const tramo of t.tramos) tareas.add(tramo.idTarea);
    return {
      tareasDistintas: tareas.size,
      reportadas: sumarDecimales(totales.map((t) => t.reportadas)),
      exceso: sumarDecimales(totales.map((t) => t.exceso)),
      propuestas: sumarDecimales(totales.map((t) => t.propuestas)),
    };
  }, [summary]);

  const manejarErrorAjuste = (idAsignacion: number, err: unknown) => {
    const status = getApiErrorStatus(err);
    const message = getApiErrorMessage(err, 'hours');
    if (status === 400) {
      setRowErrors((prev) => ({ ...prev, [idAsignacion]: message }));
      return;
    }
    if (status === 409) {
      setGlobalError({
        message: isProyectoOcupado(err)
          ? 'El proyecto está ocupado por otra operación. Actualiza e inténtalo de nuevo.'
          : 'El resumen cambió mientras trabajabas. Actualiza para ver el estado actual.',
        conflict: true,
      });
      return;
    }
    setGlobalError({ message, conflict: false });
  };

  const onUpsert = (idAsignacion: number, input: UpsertHourAdjustmentInput) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[idAsignacion];
      return next;
    });
    setGlobalError(null);
    setPendingId(idAsignacion);
    upsert.mutate(
      { idAsignacion, input },
      {
        onError: (err) => manejarErrorAjuste(idAsignacion, err),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const onRevert = (idAsignacion: number) => {
    setGlobalError(null);
    setPendingId(idAsignacion);
    revert.mutate(
      { idAsignacion },
      {
        onError: (err) => manejarErrorAjuste(idAsignacion, err),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const onLoadHistory = (idAsignacion: number) => history.mutateAsync({ idAsignacion });

  const actualizar = () => {
    setGlobalError(null);
    setCloseError(null);
    refetch();
  };

  const confirmarCierre = async () => {
    setCloseError(null);
    setClosing(true);
    try {
      await closeSprint.mutateAsync(idSprint);
      queryClient.invalidateQueries({ queryKey: sprintClosingSummaryQueryKey(idProyecto, idSprint) });
      void uvgSwal.fire({
        icon: 'success',
        title: 'Sprint cerrado',
        text: 'Las horas propuestas quedaron acreditadas y forman parte del historial del proyecto.',
        timer: 2200,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      router.push(`/dashboard/projects/${idProyecto}`);
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 409) {
        // No se pisa nada: el resumen se refresca y los blockers se vuelven a evaluar.
        refetch();
        setCloseError(
          `${mensajeDeError(err)} Se actualizó el resumen; revisa los bloqueos antes de volver a intentarlo.`,
        );
      } else {
        setCloseError(getApiErrorMessage(err, 'hours'));
      }
      setClosing(false);
    }
  };

  const puedeCerrar = !readOnly && blockers.length === 0 && !closing && pendingId == null;
  const motivoNoCerrar = readOnly
    ? estadoSprint === 'CERRADO'
      ? 'Este Sprint ya está cerrado.'
      : 'El Sprint debe estar en finalización para cerrarlo.'
    : blockers.length > 0
      ? `Hay ${blockers.length} ${blockers.length === 1 ? 'bloqueo' : 'bloqueos'} pendientes: ${blockers
          .map((b) => b.message)
          .join(' · ')}`
      : 'Hay un ajuste en curso.';

  const botonCerrar = (
    <Button
      type="button"
      onClick={confirmarCierre}
      disabled={!puedeCerrar}
      className="h-10 w-full gap-1.5 rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90 sm:w-auto"
    >
      {closing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {closing ? 'Confirmando cierre...' : 'Confirmar cierre del Sprint'}
    </Button>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 md:px-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/projects/mine" className="text-tertiary hover:text-on-surface">
                Mis proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={volverHref} className="max-w-56 truncate text-tertiary hover:text-on-surface">
                {proyecto?.tituloProyecto ?? 'Proyecto'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/dashboard/proyectos/${id}/sprints`} className="text-tertiary hover:text-on-surface">
                Sprints
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">
              {sprint ? `Sprint ${sprint.numero}` : 'Sprint'} · Finalizar
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Link
        href={volverHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al proyecto
      </Link>

      {!cargandoProyecto && !cargandoUsuario && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder al cierre de este Sprint." />
      ) : (
        <>
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
            <div className="space-y-5">
              {/* Cabecera */}
              <div className={CARD}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Flag className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <h1 className="font-headline text-2xl font-extrabold text-on-surface md:text-3xl">
                    {sprint ? `Cerrar Sprint ${sprint.numero}` : 'Cierre de Sprint'}
                  </h1>
                  {estadoSprint && (
                    <Badge
                      className={
                        estadoSprint === 'CERRADO'
                          ? 'border-transparent bg-surface-container-high text-on-surface-variant'
                          : 'border-transparent bg-amber-400/15 text-amber-800 dark:text-amber-200'
                      }
                    >
                      {estadoSprint === 'CERRADO'
                        ? 'Cerrado'
                        : estadoSprint === 'EN_FINALIZACION'
                          ? 'En finalización'
                          : 'Activo'}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-tertiary">
                  {readOnly && estadoSprint === 'CERRADO'
                    ? 'Este Sprint ya fue cerrado: las horas acreditadas se muestran en solo lectura.'
                    : 'Revisión final de horas y contribuciones antes de confirmar el cierre.'}
                </p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={ClipboardList} label="Tareas distintas" value={String(kpis.tareasDistintas)} />
                <Kpi icon={Clock} label="Horas reportadas" value={`${formatearDecimal(kpis.reportadas)} h`} />
                <Kpi
                  icon={AlertTriangle}
                  label="Exceso sobre estimación"
                  value={`${formatearDecimal(kpis.exceso)} h`}
                  tone="warning"
                />
                <Kpi icon={BarChart3} label="Horas propuestas" value={`${formatearDecimal(kpis.propuestas)} h`} />
              </div>

              {/* Blockers */}
              {blockers.length > 0 && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-800 dark:text-amber-200"
                >
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    El Sprint aún no puede cerrarse
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    {blockers.map((b) => (
                      <li key={b.code}>
                        {b.message}
                        {b.cantidad > 0 && <span className="text-xs"> ({b.cantidad})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {globalError && (
                <p role="alert" className="text-sm font-medium text-error">
                  {globalError.message}{' '}
                  {globalError.conflict && (
                    <button type="button" onClick={actualizar} className="font-bold underline underline-offset-2">
                      Actualizar
                    </button>
                  )}
                </p>
              )}

              {/* Integrantes */}
              {summary.participantes.length === 0 ? (
                <Empty tone="muted" role="status">
                  <EmptyMedia variant="icon">
                    <Flag aria-hidden="true" className="h-7 w-7" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Este Sprint no tiene contribuciones registradas.</EmptyTitle>
                    <EmptyDescription>
                      No hay participantes con tareas u horas asociadas a este Sprint todavía.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Accordion type="multiple" className="space-y-0">
                  {summary.participantes.map((participante) => (
                    <MemberItem
                      key={participante.idUsuario}
                      participante={participante}
                      readOnly={readOnly}
                      pendingId={pendingId}
                      errors={rowErrors}
                      onUpsert={onUpsert}
                      onRevert={onRevert}
                      onLoadHistory={onLoadHistory}
                    />
                  ))}
                </Accordion>
              )}

              {closeError && (
                <p role="alert" className="text-sm font-medium text-error">
                  {closeError}
                </p>
              )}
            </div>
          )}

          {/* Footer sticky */}
          {!isLoading && !isError && summary && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container-lowest/95 px-4 py-3 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8">
              <div className="mx-auto flex max-w-[1400px] flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button asChild variant="outline" className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto">
                  <Link href={volverHref}>Cancelar</Link>
                </Button>
                {puedeCerrar ? (
                  botonCerrar
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex w-full rounded-lg sm:w-auto">
                        {botonCerrar}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{motivoNoCerrar}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
