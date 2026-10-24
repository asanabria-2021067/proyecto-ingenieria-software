'use client';

import { Suspense, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Flag } from 'lucide-react';
import { useProjectSprints, useSprintClosingSummary } from '@/hooks/use-project-sprints';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';
import { HourAdjustmentRow, formatearDecimal } from '@/components/hours/hour-adjustment-row';
import { SIN_TOTALES, getInitials, useSprintClosingAdjustments } from '@/components/hours/sprint-closing.shared';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { DATA_TABLE_CARD, DATA_TABLE_ROW_BORDER, DATA_TABLE_ROW_HOVER } from '@/components/dashboard/data-table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type {
  EstadoSprint,
  SprintClosingSummaryParticipantDto,
  SprintClosingTramoDto,
} from '@/lib/types/sprints';

/**
 * Revisión de horas del cierre de un Sprint (`…/finalizar/revision`): vista
 * maestro-detalle con los integrantes a la izquierda y, a la derecha, las
 * tareas y tramos del integrante elegido, con los mismos «Ajustar» y «Ver
 * historial» de siempre (`HourAdjustmentRow`).
 *
 * Lee el mismo resumen de cierre que la pantalla principal y reutiliza sus
 * mutaciones; no confirma el cierre: eso solo ocurre en `…/finalizar`. El
 * integrante elegido vive en la URL (`?integrante=`) para que recargar,
 * compartir el enlace o volver atrás conserven el contexto.
 */

interface TareaRevision {
  clave: string;
  rol: string;
  titulo: string;
  tramos: SprintClosingTramoDto[];
}

/** Agrupa los tramos del integrante por rol y tarea, en el orden en que llegan del backend. */
function agruparPorTarea(participante: SprintClosingSummaryParticipantDto): TareaRevision[] {
  const rolPorParticipacion = new Map<number, string>();
  for (const p of participante.participaciones) rolPorParticipacion.set(p.idParticipacion, p.nombreRol);

  const porClave = new Map<string, TareaRevision>();
  for (const tramo of (participante.totales ?? SIN_TOTALES).tramos) {
    const rol =
      (tramo.idParticipacion != null ? rolPorParticipacion.get(tramo.idParticipacion) : undefined) ?? 'Sin rol vigente';
    const clave = `${rol}::${tramo.idTarea}`;
    const tarea = porClave.get(clave) ?? { clave, rol, titulo: tramo.tituloTarea, tramos: [] };
    tarea.tramos.push(tramo);
    porClave.set(clave, tarea);
  }
  return [...porClave.values()];
}

function nombreDe(participante: SprintClosingSummaryParticipantDto): string {
  return `${participante.nombre} ${participante.apellido}`;
}

function rolesDe(participante: SprintClosingSummaryParticipantDto): string {
  return participante.roles.map((rol) => rol.nombreRol).join(', ') || 'Sin rol';
}

function Metrica({ label, value, tono = 'text-text-primary' }: { label: string; value: string; tono?: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-meta">{label}</dt>
      <dd className={`mt-micro type-subtitle font-semibold tabular-nums ${tono}`}>{value}</dd>
    </div>
  );
}

function RevisionSkeleton() {
  return (
    <SkeletonRegion label="Cargando revisión de horas" className="grid gap-grid @3xl/project:grid-cols-[18rem_minmax(0,1fr)]">
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-96 w-full rounded-card" />
    </SkeletonRegion>
  );
}

function SprintHoursReview() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { summary, isLoading, isError, error, refetch } = useSprintClosingSummary(idProyecto, idSprint);
  const { sprints } = useProjectSprints(idProyecto);
  const { pendingId, rowErrors, globalError, clearGlobalError, onUpsert, onRevert, onLoadHistory } =
    useSprintClosingAdjustments(idProyecto, idSprint);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;

  const finalizarHref = `/dashboard/proyectos/${id}/sprints/${sprintId}/finalizar`;
  const sprint = sprints.find((s) => s.idSprint === idSprint) ?? null;
  const estadoSprint = summary?.estadoSprint ?? sprint?.estado ?? null;
  // Mismo criterio que la pantalla de cierre: solo un Sprint en finalización admite ajustes.
  const readOnly = estadoSprint === 'CERRADO' || estadoSprint === 'ACTIVO';
  const estiloEstado = estadoSprint
    ? (ESTADO_SPRINT_STYLE[estadoSprint as EstadoSprint] ?? ESTADO_SPRINT_STYLE.ACTIVO)
    : null;

  const participantes = useMemo(() => summary?.participantes ?? [], [summary]);
  // El integrante elegido sale de la URL; si falta o ya no existe, el primero.
  const idElegido = Number(searchParams.get('integrante'));
  const seleccionado = participantes.find((p) => p.idUsuario === idElegido) ?? participantes[0] ?? null;
  const tareas = useMemo(() => (seleccionado ? agruparPorTarea(seleccionado) : []), [seleccionado]);
  const totales = seleccionado?.totales ?? SIN_TOTALES;

  const elegir = (idUsuario: number) => {
    // `replace` y sin scroll: cambiar de integrante no llena el historial ni mueve la página.
    router.replace(`${finalizarHref}/revision?integrante=${idUsuario}`, { scroll: false });
  };

  const actualizar = () => {
    clearGlobalError();
    refetch();
  };

  if (!cargandoProyecto && !cargandoUsuario && !isLeader) {
    const volverHref = `/dashboard/proyectos/${id}`;
    return (
      <ProjectPageShell>
        <ProjectBackLink href={volverHref} label="Volver al proyecto" className="mb-card" />
        <LeaderOnlyNotice description="No puedes acceder a la revisión de horas de este Sprint." />
      </ProjectPageShell>
    );
  }

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: finalizarHref, label: 'Volver a finalizar Sprint' }}
        title={sprint ? `Revisión de horas · Sprint ${sprint.numero}` : 'Revisión de horas'}
        description={
          readOnly
            ? 'Horas por integrante, tarea y tramo, en solo lectura.'
            : 'Revisa las horas de cada integrante por tarea y tramo, y ajusta las que correspondan antes de confirmar el cierre.'
        }
        actions={estiloEstado && <span className={`pill ${estiloEstado.className}`}>{estiloEstado.label}</span>}
      />

      {isLoading && <RevisionSkeleton />}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'general') || 'No fue posible cargar la revisión de horas.'}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && summary && participantes.length === 0 && (
        <Empty role="status">
          <EmptyMedia variant="icon">
            <Flag aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Este Sprint no tiene contribuciones registradas.</EmptyTitle>
            <EmptyDescription>No hay participantes con tareas u horas asociadas a este Sprint todavia.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href={finalizarHref}>Volver a finalizar Sprint</Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && summary && seleccionado && (
        // mb-16: deja libre el final de la página bajo el widget flotante de Mensajes.
        <div className="mb-16 flex flex-col gap-stack">
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

          <div className="grid gap-grid @3xl/project:grid-cols-[18rem_minmax(0,1fr)] @3xl/project:items-start">
            {/* Móvil y tablet estrecha: un selector compacto en lugar de la columna. */}
            <div className="@3xl/project:hidden">
              <Select value={String(seleccionado.idUsuario)} onValueChange={(v) => elegir(Number(v))}>
                <SelectTrigger aria-label="Integrante" className={`w-full ${DASHBOARD_FILTER_TRIGGER_CLASS}`}>
                  <SelectValue placeholder="Integrante" />
                </SelectTrigger>
                <SelectContent>
                  {participantes.map((p) => (
                    <SelectItem key={p.idUsuario} value={String(p.idUsuario)}>
                      {nombreDe(p)} · {formatearDecimal((p.totales ?? SIN_TOTALES).propuestas)} h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <nav
              aria-label="Integrantes del Sprint"
              className={`${DATA_TABLE_CARD} hidden @3xl/project:sticky @3xl/project:top-4 @3xl/project:block`}
            >
              <ul>
                {participantes.map((p) => {
                  const activo = p.idUsuario === seleccionado.idUsuario;
                  return (
                    <li key={p.idUsuario} className={`border-b ${DATA_TABLE_ROW_BORDER} last:border-b-0`}>
                      <button
                        type="button"
                        onClick={() => elegir(p.idUsuario)}
                        aria-current={activo ? 'true' : undefined}
                        className={`flex w-full items-center gap-tight px-stack py-inline text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
                          activo ? 'bg-surface-container-low' : DATA_TABLE_ROW_HOVER
                        }`}
                      >
                        <Avatar className="size-8 shrink-0">
                          {p.fotoUrl && <AvatarImage src={p.fotoUrl} alt="" />}
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {getInitials(p.nombre, p.apellido)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="type-body block truncate font-semibold text-text-primary">{nombreDe(p)}</span>
                          <span className="type-meta block truncate">{rolesDe(p)}</span>
                        </span>
                        <span className="type-body shrink-0 font-semibold tabular-nums text-primary">
                          {formatearDecimal((p.totales ?? SIN_TOTALES).propuestas)} h
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <section aria-labelledby="integrante-seleccionado" className="card-base min-w-0">
              <div className="flex flex-wrap items-center gap-inline">
                <h2 id="integrante-seleccionado" className="type-section text-text-primary">
                  {nombreDe(seleccionado)}
                </h2>
                <span className="flex flex-wrap gap-1">
                  {seleccionado.roles.map((rol) => (
                    <span key={rol.idRolProyecto} className="pill pill-sm pill-sage">
                      {rol.nombreRol}
                    </span>
                  ))}
                </span>
              </div>

              <dl className="mt-stack grid grid-cols-2 gap-x-card gap-y-stack border-t border-outline-variant/50 pt-stack @2xl/project:grid-cols-4">
                <Metrica label="Horas reportadas" value={`${formatearDecimal(totales.reportadas)} h`} />
                <Metrica label="Horas propuestas" value={`${formatearDecimal(totales.propuestas)} h`} tono="text-primary" />
                <Metrica
                  label="Exceso sobre estimación"
                  value={`${formatearDecimal(totales.exceso)} h`}
                  tono={Number(totales.exceso) > 0 ? 'text-attention-strong dark:text-attention' : 'text-text-primary'}
                />
                <Metrica label="Tareas distintas" value={String(totales.tareasDistintas)} />
              </dl>

              <h3 className="type-subtitle mt-card font-semibold text-text-primary">Tareas y tramos</h3>
              {tareas.length === 0 ? (
                <p className="type-body mt-tight text-text-secondary">Este integrante no tiene tramos de horas en el Sprint.</p>
              ) : (
                // `key`: al cambiar de integrante los acordeones vuelven a su estado inicial.
                <Accordion
                  key={seleccionado.idUsuario}
                  type="multiple"
                  defaultValue={tareas.length === 1 ? [tareas[0].clave] : []}
                  className="mt-tight border-t border-outline-variant/50"
                >
                  {tareas.map((tarea) => (
                    <AccordionItem key={tarea.clave} value={tarea.clave} className={DATA_TABLE_ROW_BORDER}>
                      <AccordionTrigger className="items-center gap-inline py-inline hover:no-underline">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-inline gap-y-micro">
                          <span className="type-body font-semibold text-text-primary">{tarea.titulo}</span>
                          <span className="pill pill-sm pill-sage">{tarea.rol}</span>
                          <span className="type-meta tabular-nums">
                            {tarea.tramos.length === 1 ? '1 tramo' : `${tarea.tramos.length} tramos`}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-stack pt-0">
                        <div className="divide-y divide-outline-variant/50">
                          {tarea.tramos.map((tramo, index) => (
                            <HourAdjustmentRow
                              key={tramo.idAsignacion}
                              tramo={tramo}
                              indice={index + 1}
                              disabled={readOnly}
                              pending={pendingId === tramo.idAsignacion}
                              error={rowErrors[tramo.idAsignacion] ?? null}
                              onUpsert={onUpsert}
                              onRevert={onRevert}
                              onLoadHistory={onLoadHistory}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </section>
          </div>

          <div className="flex justify-start border-t border-outline-variant/40 pt-card">
            <Button asChild variant="outline" className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto">
              <Link href={finalizarHref}>Volver a finalizar Sprint</Link>
            </Button>
          </div>
        </div>
      )}
    </ProjectPageShell>
  );
}

/** `useSearchParams` exige un límite de Suspense en el build de Next. */
export default function SprintHoursReviewPage() {
  return (
    <Suspense fallback={null}>
      <SprintHoursReview />
    </Suspense>
  );
}
