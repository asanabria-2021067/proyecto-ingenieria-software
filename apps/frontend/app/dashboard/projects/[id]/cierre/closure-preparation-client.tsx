'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardCheck, FileText, Loader2, Send, Users } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  useCloseReadiness,
  useClosureDraft,
  useClosureMutations,
  useClosureRevision,
} from '@/hooks/use-closure';
import { ClosureReadinessPanel, countPassedChecks, TOTAL_CLOSURE_CHECKS } from '@/components/closure/closure-readiness-panel';
import { ClosureDocumentsManager } from '@/components/closure/closure-documents-manager';
import { ClosureStatusBanner } from '@/components/projects/closure-status-banner';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiErrorStatus,
  getFileTooLargeMessage,
  isClosureNoConfigurado,
} from '@/components/projects/api-error';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import uvgSwal, { swalCustomClass } from '@/lib/swal';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { ClosurePhase, ClosureWarning } from '@/lib/types/closure';

interface Props {
  id: number;
}

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

function PreparationSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-6 md:px-7" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-28 w-full rounded-xl" />
      <Skeleton className="mb-4 h-24 w-full rounded-xl" />
      <Skeleton className="mb-4 h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

/** Fase del readiness y del envío, derivada SOLO del estado del proyecto. */
export function resolveClosurePhase(estadoProyecto: string): ClosurePhase {
  return estadoProyecto === 'EN_SOLICITUD_CIERRE' ? 'RESUBMIT' : 'REQUEST';
}

// ─── Vista principal ─────────────────────────────────────────────────────────
function ClosurePreparationView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;
  const router = useRouter();
  const phase = resolveClosurePhase(proyecto.estadoProyecto);
  const estadoOperable = proyecto.estadoProyecto === 'EN_PROGRESO' || proyecto.estadoProyecto === 'EN_SOLICITUD_CIERRE';

  const draftQuery = useClosureDraft(idProyecto, phase, estadoOperable);
  const draft = draftQuery.data ?? null;
  const readinessQuery = useCloseReadiness(idProyecto, phase, estadoOperable && draft != null);
  const revisionQuery = useClosureRevision(idProyecto, draft?.numeroRevision, draft != null);
  const { generate, upload, detach, submit, refreshAll } = useClosureMutations(idProyecto);

  const [docsError, setDocsError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [detachingId, setDetachingId] = useState<number | null>(null);

  const readiness = readinessQuery.data ?? null;
  const revision = revisionQuery.data ?? null;
  const warningPostulaciones: ClosureWarning | null =
    readiness?.warnings.find((w) => w.code === 'POSTULACIONES_PENDIENTES') ?? null;

  const faltantes = useMemo(
    () => (readiness ? TOTAL_CLOSURE_CHECKS - countPassedChecks(readiness.blockers) : null),
    [readiness],
  );

  const manejarErrorDocs = (err: unknown, contexto: 'generar' | 'subir' | 'quitar', file?: File) => {
    const status = getApiErrorStatus(err);
    if (isClosureNoConfigurado(err)) {
      setStorageUnavailable(true);
      setDocsError(getApiErrorMessage(err, 'closure'));
      return;
    }
    if (status === 413) {
      setDocsError(
        contexto === 'generar'
          ? `${getFileTooLargeMessage()} El informe generado excede el límite; no se ha vinculado.`
          : getFileTooLargeMessage(file?.size),
      );
      return;
    }
    if (status === 409 && getApiErrorCode(err) === 'RESERVA_NO_DISPONIBLE') {
      setDocsError('Ya tienes dos cargas en curso para esta entrega. Espera a que terminen o vuelve a intentarlo en unos minutos.');
      return;
    }
    if (status === 409) {
      refreshAll();
    }
    setDocsError(getApiErrorMessage(err, 'closure'));
  };

  const onGenerate = () => {
    if (!draft) return;
    setDocsError(null);
    generate.mutate({ revisionId: draft.idRevisionCierre }, { onError: (err) => manejarErrorDocs(err, 'generar') });
  };

  const onUpload = (file: File) => {
    if (!draft) return;
    setDocsError(null);
    upload.mutate(
      { revisionId: draft.idRevisionCierre, file },
      { onError: (err) => manejarErrorDocs(err, 'subir', file) },
    );
  };

  const onDetach = (documentId: number) => {
    if (!draft) return;
    setDocsError(null);
    setDetachingId(documentId);
    detach.mutate(
      { documentId, revisionId: draft.idRevisionCierre },
      { onError: (err) => manejarErrorDocs(err, 'quitar'), onSettled: () => setDetachingId(null) },
    );
  };

  const canSubmit = Boolean(readiness?.canSubmit && readiness.executionFingerprint && draft && !submit.isPending);

  const motivoNoEnviar = (() => {
    if (!readiness || !draft) return 'Cargando la verificación del cierre…';
    if (!readiness.canSubmit) {
      const n = faltantes ?? 0;
      return `Faltan ${n} ${n === 1 ? 'comprobación' : 'comprobaciones'}: completa todos los elementos para habilitar esta acción.`;
    }
    if (!readiness.executionFingerprint) return 'Genera el informe automático antes de enviar.';
    return 'Enviando…';
  })();

  const enviarSolicitud = async () => {
    if (!readiness || !draft || !readiness.executionFingerprint) return;
    const pendientes = warningPostulaciones?.cantidad ?? 0;
    const textoPostulaciones =
      pendientes > 0
        ? ` Se rechazarán automáticamente ${pendientes} ${pendientes === 1 ? 'postulación pendiente' : 'postulaciones pendientes'}.`
        : '';
    const result = await uvgSwal.fire({
      icon: 'warning',
      title: phase === 'RESUBMIT' ? '¿Reenviar la entrega corregida?' : '¿Enviar la solicitud de cierre?',
      text: `El proyecto pasará a revisión administrativa y no admitirá cambios mientras tanto.${textoPostulaciones}`,
      showCancelButton: true,
      confirmButtonText: phase === 'RESUBMIT' ? 'Reenviar' : 'Enviar solicitud',
      cancelButtonText: 'Cancelar',
      customClass: { ...swalCustomClass },
    });
    if (!result.isConfirmed) return;

    setSubmitError(null);
    submit.mutate(
      {
        phase,
        input: {
          revisionId: draft.idRevisionCierre,
          confirmado: true,
          expectedFingerprint: readiness.executionFingerprint,
        },
      },
      {
        onSuccess: () => {
          void uvgSwal.fire({
            icon: 'success',
            title: phase === 'RESUBMIT' ? 'Entrega reenviada' : 'Solicitud de cierre enviada',
            text: 'Un administrador revisará la entrega.',
            timer: 2200,
            timerProgressBar: true,
            showConfirmButton: false,
          });
          router.push(`/dashboard/projects/${idProyecto}`);
        },
        onError: (err) => {
          const status = getApiErrorStatus(err);
          if (status === 409) {
            // Nunca se reenvía en silencio: se refresca y se pide reconfirmar.
            refreshAll();
            setSubmitError({
              message: `${getApiErrorMessage(err, 'closure')} Actualiza la verificación y vuelve a confirmar.`,
              conflict: true,
            });
            return;
          }
          setSubmitError({ message: getApiErrorMessage(err, 'closure'), conflict: false });
        },
      },
    );
  };

  const botonEnviar = (
    <Button
      type="button"
      onClick={enviarSolicitud}
      disabled={!canSubmit}
      className="h-10 w-full gap-1.5 rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90 sm:w-auto"
    >
      {submit.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      {phase === 'RESUBMIT' ? 'Reenviar entrega corregida' : 'Enviar solicitud de cierre'}
    </Button>
  );

  const volverHref = `/dashboard/projects/${idProyecto}`;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-32 pt-5 md:px-7">
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
              <Link href={volverHref} className="max-w-[16rem] truncate text-tertiary hover:text-on-surface">
                {proyecto.tituloProyecto}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">Cierre</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Hero */}
      <div className={`${CARD} mb-4 flex gap-4`}>
        <span className="hidden size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex" aria-hidden="true">
          <FileText className="size-8" />
        </span>
        <div className="min-w-0 space-y-2">
          <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-on-surface md:text-[28px]">
            {proyecto.tituloProyecto}
          </h1>
          <p className="text-sm text-tertiary">
            Preparación del cierre{draft ? ` — entrega #${draft.numeroRevision}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tipoBadgeStyle(proyecto.tipoProyecto)}`}>
              {tipoBadgeLabel(proyecto.tipoProyecto)}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
              {estadoBadgeLabel(proyecto.estadoProyecto)}
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Líder
            </span>
          </div>
        </div>
      </div>

      {phase === 'RESUBMIT' && (
        <ClosureStatusBanner
          idProyecto={idProyecto}
          estadoProyecto={proyecto.estadoProyecto}
          revision={revision ?? draft ? { estadoRevision: 'BORRADOR', numeroRevision: draft?.numeroRevision ?? 0, comentarioRevisor: revision?.comentarioRevisor ?? null } : null}
          className="mb-4"
        />
      )}

      {!estadoOperable && (
        <Empty tone="muted" role="status" className="mb-4">
          <EmptyMedia variant="icon">
            <ClipboardCheck aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>El cierre no está disponible en este estado.</EmptyTitle>
            <EmptyDescription>
              La preparación del cierre solo aplica a proyectos en progreso o con una corrección documental pendiente.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {estadoOperable && draftQuery.isError && (
        <div role="alert" className="mb-4 rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-on-surface">
          <p className="font-semibold">{getApiErrorMessage(draftQuery.error, 'closure')}</p>
          {getApiErrorStatus(draftQuery.error) !== 403 && (
            <Button type="button" variant="outline" size="sm" onClick={() => draftQuery.refetch()} className="mt-2 h-8 text-xs font-semibold">
              Reintentar
            </Button>
          )}
        </div>
      )}

      {estadoOperable && draftQuery.isSuccess && draft == null && (
        <Empty tone="default" role="status" className="mb-4">
          <EmptyMedia variant="icon">
            <ClipboardCheck aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>La entrega ya fue enviada.</EmptyTitle>
            <EmptyDescription>
              Un administrador está revisando la solicitud de cierre. Recibirás una notificación con el veredicto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {estadoOperable && draft && (
        <div className="space-y-4">
          {readinessQuery.isError ? (
            <div role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-on-surface">
              <p className="font-semibold">{getApiErrorMessage(readinessQuery.error, 'closure')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => readinessQuery.refetch()} className="mt-2 h-8 text-xs font-semibold">
                Reintentar
              </Button>
            </div>
          ) : (
            <ClosureReadinessPanel summary={readiness} isLoading={readinessQuery.isPending} />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ClosureDocumentsManager
              projectId={idProyecto}
              revision={revisionQuery.isError ? null : revision}
              isLoading={revisionQuery.isPending}
              allowGenerate={phase === 'REQUEST'}
              storageUnavailable={storageUnavailable}
              onGenerate={onGenerate}
              generating={generate.isPending}
              onUpload={onUpload}
              uploading={upload.isPending}
              onDetach={onDetach}
              detachingId={detachingId}
              error={docsError}
            />

            <section
              aria-labelledby="closure-warning-title"
              className={`${CARD} ${
                warningPostulaciones
                  ? 'border-amber-400/40 bg-amber-400/10'
                  : 'border-outline-variant/30'
              }`}
            >
              <div className="flex gap-3">
                <AlertTriangle
                  className={`mt-0.5 size-5 shrink-0 ${warningPostulaciones ? 'text-amber-600 dark:text-amber-400' : 'text-tertiary'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <h2 id="closure-warning-title" className={`text-sm font-bold ${warningPostulaciones ? 'text-amber-800 dark:text-amber-200' : 'text-on-surface'}`}>
                    {warningPostulaciones
                      ? 'Al enviar la solicitud de cierre se rechazarán postulaciones pendientes'
                      : 'Postulaciones pendientes'}
                  </h2>
                  <p className={`mt-1 text-xs ${warningPostulaciones ? 'text-amber-800/90 dark:text-amber-200/90' : 'text-tertiary'}`}>
                    {warningPostulaciones
                      ? warningPostulaciones.message
                      : 'No hay postulaciones pendientes que se vean afectadas por el cierre.'}
                  </p>
                  <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-container-lowest/70 p-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-surface-container-high text-tertiary" aria-hidden="true">
                      <Users className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs text-tertiary">Postulaciones pendientes</p>
                      <p className="text-xl font-bold text-on-surface" aria-label={`${warningPostulaciones?.cantidad ?? 0} postulaciones pendientes`}>
                        {warningPostulaciones?.cantidad ?? 0}
                      </p>
                      <p className="text-[11px] text-tertiary">
                        {warningPostulaciones ? 'Solicitud(es) que serán rechazadas' : 'Ninguna solicitud se verá afectada'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {submitError && (
            <p role="alert" className="text-sm font-medium text-error">
              {submitError.message}{' '}
              {submitError.conflict && (
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError(null);
                    refreshAll();
                  }}
                  className="font-bold underline underline-offset-2"
                >
                  Actualizar
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* Footer sticky */}
      {estadoOperable && draft && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container-low/95 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:px-7">
          <div className="mx-auto flex max-w-[1400px] flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="outline" className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto">
              <Link href={volverHref}>Cancelar</Link>
            </Button>
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              {canSubmit ? (
                botonEnviar
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex w-full rounded-lg sm:w-auto">
                      {botonEnviar}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{motivoNoEnviar}</TooltipContent>
                </Tooltip>
              )}
              {!canSubmit && (
                <p className="text-[11px] text-tertiary sm:text-right">{motivoNoEnviar}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default function ClosurePreparationClient({ id }: Props) {
  const idValido = Number.isInteger(id) && id > 0;
  const { data: proyecto, isLoading, isError, error, refetch } = useProjectDetail(idValido ? id : 0);
  const { isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = useIsProjectLeader(idValido ? id : 0);

  if (!idValido) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Empty tone="muted" role="status">
          <EmptyHeader>
            <EmptyTitle>Proyecto no válido.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (isLoading || cargandoUsuario) return <PreparationSkeleton />;

  if (isError || !proyecto) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-lg font-bold text-on-surface">
          {getApiErrorStatus(error) === 404 ? 'Este proyecto ya no existe.' : 'No fue posible cargar el proyecto.'}
        </h1>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/projects/mine">Mis proyectos</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!isLeader) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <LeaderOnlyNotice description="Solo el líder del proyecto puede preparar y enviar el cierre." />
      </div>
    );
  }

  return <ClosurePreparationView proyecto={proyecto} />;
}
