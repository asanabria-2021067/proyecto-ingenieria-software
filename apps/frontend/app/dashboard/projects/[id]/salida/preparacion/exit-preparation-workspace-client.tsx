'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import {
  useContinueExitPreparation,
  useCurrentExitRequest,
  useExitPreparationSummary,
} from '@/hooks/use-exit-request';
import { CloseAssignmentForm } from '@/components/projects/close-assignment-form';
import { PendingLeaderReview } from '@/components/projects/pending-leader-review';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import {
  ESTADO_COLUMNA_STYLE,
  getProgressVisualState,
  type EstadoColumnaStyle,
} from '@/components/projects/task-board.utils';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { MODALIDAD_LABEL } from '@/types';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { ExitPreparationBlockerDto, ExitPreparationSummaryDto } from '@/lib/types/exit-requests';

interface Props {
  id: number;
}

function formatearFechaAsignacion(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function queryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo cargar la preparación de tu salida. Intenta nuevamente.';
}

// ─── Columnas de preparación ─────────────────────────────────────────────────
// B6 (ExitPreparationSummary) solo expone dos booleanos por responsabilidad
// (`tieneHoras`/`tieneAvance`, ya decididos por el backend) — nunca una
// máquina de estados de 4 pasos. La clasificación de abajo es una traducción
// puramente presentacional de esos dos booleanos, no una regla de negocio
// nueva. `CERRADO` nunca recibe elementos: B6 solo devuelve asignaciones
// todavía vigentes (`desasignadaEn: null`); en cuanto una responsabilidad se
// cierra de verdad (F10) queda excluida de esta respuesta por completo — no
// pasa a un estado "cerrado" dentro de la misma lista. Se documenta como
// discrepancia frente a la maqueta en vez de fabricar datos.
type PreparationColumnKey = 'POR_PREPARAR' | 'EN_PREPARACION' | 'LISTO_PARA_CIERRE' | 'CERRADO';

interface PreparationColumnConfig {
  key: PreparationColumnKey;
  titulo: string;
}

const PREPARATION_COLUMNS: readonly PreparationColumnConfig[] = [
  { key: 'POR_PREPARAR', titulo: 'Por preparar' },
  { key: 'EN_PREPARACION', titulo: 'En preparación' },
  { key: 'LISTO_PARA_CIERRE', titulo: 'Listo para cierre' },
  { key: 'CERRADO', titulo: 'Cerrado' },
] as const;

/** Reutiliza literalmente los tokens de color ya centralizados en el Kanban normal (gris/ámbar/azul/verde) — no se define una paleta nueva. */
const PREPARATION_COLUMN_STYLE: Record<PreparationColumnKey, EstadoColumnaStyle> = {
  POR_PREPARAR: ESTADO_COLUMNA_STYLE.POR_HACER,
  EN_PREPARACION: ESTADO_COLUMNA_STYLE.EN_PROGRESO,
  LISTO_PARA_CIERRE: ESTADO_COLUMNA_STYLE.EN_REVISION,
  CERRADO: ESTADO_COLUMNA_STYLE.HECHO,
};

function clasificarColumna(item: ExitPreparationBlockerDto): PreparationColumnKey {
  if (item.tieneHoras && item.tieneAvance) return 'LISTO_PARA_CIERRE';
  if (item.tieneHoras || item.tieneAvance) return 'EN_PREPARACION';
  return 'POR_PREPARAR';
}

// ─── Tarjeta de responsabilidad ──────────────────────────────────────────────
// Mismo lenguaje visual que TaskCard (mismas clases de card: rounded-lg
// border bg-surface-container-lowest p-3 shadow-sm) pero no es TaskCard: B6
// no expone descripción, asignado, etiquetas ni comentarios — solo el
// subconjunto de AsignacionTarea relevante para la preparación de salida.
// Fabricar esos campos inventaría datos que el backend no decide.
function ResponsibilityCard({
  item,
  onCerrarTramo,
}: {
  item: ExitPreparationBlockerDto;
  onCerrarTramo: (item: ExitPreparationBlockerDto) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-sm">
      <p className="text-sm font-semibold text-on-surface">{item.tituloTarea}</p>
      {/* "Pendiente de cierre" describe exactamente a todo elemento de este
          read-model: B6 solo devuelve asignaciones todavía vigentes
          (desasignadaEn: null) de una solicitud en PREPARACION — por
          construcción, cada una está pendiente de cerrarse. No se deriva de
          una propiedad secundaria. */}
      <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-tertiary">
        Pendiente de cierre
      </span>
      <div className="flex items-center justify-between text-[11px] text-tertiary">
        <span>Asignada el {formatearFechaAsignacion(item.fechaAsignacion)}</span>
        {item.estadoPreparacion === 'COMPLETA' && (
          <CheckCircle2
            className="size-4 text-green-600 dark:text-green-400"
            aria-hidden="true"
            aria-label="Lista para cierre"
          />
        )}
      </div>
      {/* F10 — punto de entrada compartido: abre el mismo CloseAssignmentForm
          que el Kanban normal, nunca un formulario paralelo. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onCerrarTramo(item)}
        className="h-8 w-full rounded-md border-outline-variant text-xs font-semibold"
      >
        Cerrar tramo
      </Button>
    </div>
  );
}

// ─── Tablero filtrado (solo lectura) ─────────────────────────────────────────
// Reutiliza la estructura visual de KanbanColumn (task-board.tsx): mismo
// encabezado con punto + título + contador, mismo grid responsive con
// overflow-x-auto. No reutiliza el componente literal porque KanbanColumn
// está acoplado a EstadoTarea/DnD/@dnd-kit — este tablero es de solo lectura
// (F9 no implementa el cierre de tramo; eso es F10) y el backend no expone
// ninguna transición para "mover" una responsabilidad entre estas columnas.
function ExitPreparationBoard({
  blockers,
  onCerrarTramo,
}: {
  blockers: ExitPreparationBlockerDto[];
  onCerrarTramo: (item: ExitPreparationBlockerDto) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid min-h-72 min-w-280 grid-cols-4 gap-4 xl:min-w-0">
        {PREPARATION_COLUMNS.map((columna) => {
          const items = blockers.filter((b) => clasificarColumna(b) === columna.key);
          const estilo = PREPARATION_COLUMN_STYLE[columna.key];
          return (
            <section
              key={columna.key}
              aria-labelledby={`preparacion-columna-${columna.key}-heading`}
              className="flex min-h-0 min-w-0 flex-col gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-low p-3"
            >
              <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${estilo.headerBg}`}>
                <h3
                  id={`preparacion-columna-${columna.key}-heading`}
                  className={`flex items-center gap-2 text-[13px] font-bold ${estilo.headerText}`}
                >
                  <span className={`inline-block size-2 rounded-full ${estilo.dot}`} aria-hidden="true" />
                  {columna.titulo}
                </h3>
                <span
                  className={`inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface-container-highest px-1.5 text-xs font-semibold ${estilo.headerText}`}
                >
                  {items.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 pr-1">
                {items.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-8 text-center">
                    <span
                      className={`inline-block size-2.5 rounded-full ${estilo.dot} opacity-40`}
                      aria-hidden="true"
                    />
                    <p className="text-xs text-tertiary">Sin responsabilidades en este estado.</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <ResponsibilityCard key={item.idAsignacion} item={item} onCerrarTramo={onCerrarTramo} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tarjeta de progreso + acción "Continuar solicitud de salida" ───────────
// `prepared`/`total` son una reducción presentacional segura de valores que
// el backend ya decidió (`estadoPreparacion` por ítem, tamaño del arreglo
// `blockers`) — nunca se recalculan blockers a partir de otra fuente. El
// gate real de la acción es exclusivamente `summary.puedeContinuar` (B6/B7,
// exit-requests.service.ts): NO se deriva de `prepared === total`. Ver la
// discrepancia documentada en la auditoría — bajo el contrato actual,
// `puedeContinuar` exige `blockers.length === 0` (cero asignaciones
// vigentes), una condición más estricta que "todas con estadoPreparacion
// COMPLETA", así que el botón puede seguir disabled incluso si el contador
// visual llegara a "N de N".
function ExitPreparationProgressCard({
  summary,
  onContinuar,
  isContinuing,
  continuarError,
}: {
  summary: ExitPreparationSummaryDto;
  onContinuar: () => void;
  isContinuing: boolean;
  continuarError: string | null;
}) {
  const total = summary.blockers.length;
  const prepared = summary.blockers.filter((b) => b.estadoPreparacion === 'COMPLETA').length;
  const porcentaje = total === 0 ? 100 : Math.round((prepared / total) * 100);
  const visual = getProgressVisualState(porcentaje);
  const puedeContinuar = summary.puedeContinuar;

  return (
    <div className="mb-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">
            {total === 0
              ? 'No tienes responsabilidades pendientes de preparar'
              : `${prepared} de ${total} responsabilidades preparadas`}
          </p>
          <div
            role="progressbar"
            aria-valuenow={porcentaje}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de preparación de salida"
            className={`mt-2 h-2 w-full max-w-xl overflow-hidden rounded-full ${visual.track}`}
          >
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${visual.bar}`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!puedeContinuar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Por qué no puedo continuar todavía"
                  className="flex size-6 items-center justify-center rounded-full text-tertiary hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Info className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Debes preparar todas tus responsabilidades antes de continuar.</TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            onClick={onContinuar}
            disabled={!puedeContinuar || isContinuing}
            className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90 disabled:bg-surface-container-high disabled:text-tertiary disabled:opacity-100"
          >
            {isContinuing && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Continuar solicitud de salida
          </Button>
        </div>
      </div>
      {continuarError && (
        <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
          {continuarError}
        </p>
      )}
    </div>
  );
}

// ─── Skeletons (Sección 28: patrón dominante = skeletons locales) ───────────
function ExitPreparationWorkspaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-6 md:px-7">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-28 w-full max-w-2xl rounded-xl" />
      <ExitPreparationBodySkeleton />
    </div>
  );
}

function ExitPreparationBodySkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-24 w-full rounded-xl" />
      <Skeleton className="mb-4 h-9 w-56" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72 w-[280px] shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Vista principal ─────────────────────────────────────────────────────────
function ExitPreparationWorkspaceView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;

  // F11.1 — única fuente de verdad server-authoritative para decidir entre
  // PREPARACION / PENDIENTE_LIDER / NONE. Sobrevive refresh, hard reload y
  // entrada directa por URL porque proviene de GET /salida/estado
  // (getSolicitudSalidaAbierta), no de un useState poblado solo por la
  // respuesta de una mutation en la sesión actual — ese placeholder
  // (`solicitudPendiente`) se elimina por completo en F11.1.
  const {
    request: currentRequest,
    isLoading: isLoadingCurrent,
    isError: isErrorCurrent,
    error: currentError,
    refetch: refetchCurrent,
  } = useCurrentExitRequest(idProyecto);

  const esPreparacion = currentRequest?.estadoSolicitud === 'PREPARACION';
  const esPendienteLider = currentRequest?.estadoSolicitud === 'PENDIENTE_LIDER';

  // B6 (ExitPreparationSummary) solo debe dispararse cuando currentRequest ya
  // confirmó PREPARACION — de lo contrario B6 respondería 400 de forma
  // predecible e inútil (Sección 18/26 de la auditoría F11.1). `habilitado`
  // es la extensión mínima que F7 necesitó para soportar este gating.
  const { summary, isLoading: isLoadingSummary, isError: isErrorSummary, error: summaryError, refetch: refetchSummary } =
    useExitPreparationSummary(idProyecto, esPreparacion);
  const continuarPreparacion = useContinueExitPreparation(idProyecto);

  const [continuarError, setContinuarError] = useState<string | null>(null);

  // F10 — responsabilidad seleccionada para "Cerrar tramo" (mismo
  // CloseAssignmentForm que el Kanban normal). null cuando el diálogo está
  // cerrado; el propio Dialog controla su visibilidad vía `open`, este
  // estado solo decide CUÁL asignación se cierra.
  const [cerrarTramoContexto, setCerrarTramoContexto] = useState<ExitPreparationBlockerDto | null>(
    null,
  );

  const handleContinuar = () => {
    setContinuarError(null);
    // useContinueExitPreparation (F7/F11.1) ya siembra e invalida
    // currentExitRequestQueryKey con el body real de B7 en su propio
    // onSuccess: en cuanto esa query se actualiza, `currentRequest` cambia a
    // PENDIENTE_LIDER y este componente vuelve a renderizar mostrando
    // PendingLeaderReview automáticamente — no hace falta ningún callback
    // local de éxito aquí.
    continuarPreparacion.mutate(undefined, {
      onError: (err) => {
        setContinuarError(getApiErrorMessage(err));
        // El backend revalida blockers al continuar (server-authoritative);
        // si rechazó la transición, refresca el read-model para reflejar el
        // estado real antes de dejar reintentar.
        void refetchSummary();
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-5 md:px-7">
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
              <Link
                href={`/dashboard/proyectos/${idProyecto}`}
                className="max-w-[16rem] truncate text-tertiary hover:text-on-surface"
              >
                {proyecto.tituloProyecto}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">Preparación de salida</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-on-surface md:text-[28px]">
              {proyecto.tituloProyecto}
            </h1>
            <p className="text-sm text-tertiary">Workspace del proyecto</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
              >
                {estadoBadgeLabel(proyecto.estadoProyecto)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tipoBadgeStyle(proyecto.tipoProyecto)}`}
              >
                {tipoBadgeLabel(proyecto.tipoProyecto)}
              </span>
              <span className="inline-flex items-center rounded-full border border-outline-variant/30 px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ??
                  proyecto.modalidadProyecto}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
            >
              <Link href={`/dashboard/proyectos/${idProyecto}`}>Volver al proyecto</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* F11.1 — orden de carga: primero se resuelve currentRequest
          (server-authoritative). Mientras esté isLoadingCurrent, nunca se
          renderiza F9 ni F11 — evita el flash "Kanban -> luego Solicitud
          enviada" en carga directa. */}
      {isLoadingCurrent ? (
        <ExitPreparationBodySkeleton />
      ) : isErrorCurrent ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-10 text-center shadow-sm"
        >
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{queryErrorMessage(currentError)}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchCurrent()}
            className="rounded-lg border-primary text-xs font-bold text-primary hover:bg-primary/10"
          >
            Reintentar
          </Button>
        </div>
      ) : esPendienteLider ? (
        <PendingLeaderReview solicitadaEn={currentRequest?.solicitadaEn} motivo={currentRequest?.motivo} />
      ) : esPreparacion ? (
        isLoadingSummary ? (
          <ExitPreparationBodySkeleton />
        ) : isErrorSummary ? (
          <div
            role="alert"
            className="space-y-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-10 text-center shadow-sm"
          >
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{queryErrorMessage(summaryError)}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSummary()}
              className="rounded-lg border-primary text-xs font-bold text-primary hover:bg-primary/10"
            >
              Reintentar
            </Button>
          </div>
        ) : summary ? (
          <>
            <ExitPreparationProgressCard
              summary={summary}
              onContinuar={handleContinuar}
              isContinuing={continuarPreparacion.isPending}
              continuarError={continuarError}
            />

            <div className="min-h-0 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm md:p-5">
              <div className="mb-5 flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-on-surface md:text-[22px]">
                  Mis responsabilidades para salida
                </h2>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {summary.blockers.length}{' '}
                  {summary.blockers.length === 1 ? 'responsabilidad' : 'responsabilidades'}
                </span>
              </div>

              {summary.blockers.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircle2 aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No tienes responsabilidades pendientes</EmptyTitle>
                    <EmptyDescription>
                      No hay asignaciones vigentes que preparar antes de continuar tu solicitud de salida.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ExitPreparationBoard blockers={summary.blockers} onCerrarTramo={setCerrarTramoContexto} />
              )}
            </div>
          </>
        ) : null
      ) : (
        // NONE — currentRequest.request es null: no hay solicitud abierta
        // (nunca se creó una, o ya fue APROBADA/RECHAZADA/CANCELADA). No es
        // un error; es un resultado de lectura real y válido de F11.1. No se
        // reimplementa F8 aquí — solo se informa el estado real.
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No tienes una solicitud de salida en preparación</EmptyTitle>
            <EmptyDescription>
              No existe actualmente una solicitud de salida abierta para este proyecto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* F10 — mismo CloseAssignmentForm que el Kanban normal. Tras un cierre
          exitoso, B6 ya no devolverá esta asignación como blocker: se
          refresca `exit-preparation-summary` para que el próximo render
          refleje el estado real del servidor — nunca se mantiene la card
          "cerrada" artificialmente en el cliente. */}
      <CloseAssignmentForm
        open={cerrarTramoContexto !== null}
        onOpenChange={(open) => {
          if (!open) setCerrarTramoContexto(null);
        }}
        idProyecto={idProyecto}
        idTarea={cerrarTramoContexto?.idTarea ?? 0}
        idAsignacion={cerrarTramoContexto?.idAsignacion ?? 0}
        tituloTarea={cerrarTramoContexto?.tituloTarea}
        onSuccess={() => {
          setCerrarTramoContexto(null);
          void refetchSummary();
        }}
      />
    </div>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default function ExitPreparationWorkspaceClient({ id }: Props) {
  const { data: proyecto, isLoading, error } = useProjectDetail(id);

  if (isLoading) {
    return <ExitPreparationWorkspaceSkeleton />;
  }

  if (error || !proyecto) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="font-medium text-red-600 dark:text-red-400">
          No se pudo cargar el proyecto. Intenta nuevamente.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/projects/mine">Volver a mis proyectos</Link>
        </Button>
      </div>
    );
  }

  return <ExitPreparationWorkspaceView proyecto={proyecto} />;
}
