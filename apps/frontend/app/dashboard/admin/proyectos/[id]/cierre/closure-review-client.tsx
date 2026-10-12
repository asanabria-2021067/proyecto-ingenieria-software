'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { useAdminProjectDetail } from '@/hooks/use-admin-projects';
import { useCloseReadiness, useClosureRevision, useClosureRevisions } from '@/hooks/use-closure';
import { findRevisionEnviada, useClosureReview } from '@/hooks/use-closure-review';
import { isHistoricalDetail } from '@/lib/services/admin-projects';
import { COMENTARIO_VEREDICTO_MAX } from '@/lib/services/closure-review';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle, tipoBadgeLabel } from '@/components/projects/available-project-card';
import { ClosureReadinessPanel } from '@/components/closure/closure-readiness-panel';
import { ClosureDocumentsManager, MAX_EVIDENCIAS } from '@/components/closure/closure-documents-manager';
import { TOTAL_CLOSURE_CHECKS, countPassedChecks } from '@/components/closure/closure-readiness-panel';
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/components/admin/admin-tabs';
import { ESTADO_PARTICIPACION_STYLE, type EstadoParticipacion } from '@/components/projects/member-status.utils';
import { ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import type { EstadoSprint } from '@/lib/types/sprints';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import uvgSwal from '@/lib/swal';
import { adminProjectsGroupHref } from '@/lib/types/admin-projects';
import type { ClosureRevision } from '@/lib/types/closure';
import { ADMIN_PAGE_WIDTH } from '@/components/admin/admin-page';

const PAGE = ADMIN_PAGE_WIDTH;
// Misma tabla que las bandejas administrativas (`data-table`).
const TH = `h-auto whitespace-nowrap px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-middle';

const ESTADO_PARTICIPACION_LABEL: Record<string, string> = { ACTIVO: 'Activa', RETIRADO: 'Retirada', COMPLETADO: 'Completada' };

type Veredicto = 'DEVOLVER' | 'CORREGIR' | 'APROBAR';

const VEREDICTO_META: Record<
  Veredicto,
  { titulo: string; descripcion: string; etiquetaComentario: string; obligatorio: boolean; confirmar: string; exito: string }
> = {
  DEVOLVER: {
    titulo: 'Devolver a ejecución',
    descripcion:
      'El proyecto vuelve a EN_PROGRESO y el equipo podrá seguir trabajando. Las horas pendientes siguen pendientes. Indica el motivo al líder.',
    etiquetaComentario: 'Comentario para el líder',
    obligatorio: true,
    confirmar: 'Devolver a ejecución',
    exito: 'El proyecto volvió a ejecución.',
  },
  CORREGIR: {
    titulo: 'Solicitar corrección documental',
    descripcion:
      'El proyecto sigue en solicitud de cierre. Se crea un nuevo borrador que hereda los documentos vinculados para que el líder corrija y reenvíe.',
    etiquetaComentario: 'Qué debe corregir el líder',
    obligatorio: true,
    confirmar: 'Solicitar corrección',
    exito: 'Se solicitó la corrección documental.',
  },
  APROBAR: {
    titulo: 'Aprobar cierre',
    descripcion:
      'Cierra el proyecto, acredita las horas y produce el informe oficial en una sola operación. Esta acción no se puede deshacer.',
    etiquetaComentario: 'Comentario (opcional)',
    obligatorio: false,
    confirmar: 'Aprobar cierre',
    exito: 'Cierre aprobado: el proyecto quedó cerrado y las horas acreditadas.',
  },
};

const MSG_503_APROBACION =
  'El informe oficial no pudo producirse y el proyecto NO se cerró: nada cambió. Puedes reintentar más tarde.';
const MSG_409 = 'Otro administrador resolvió esta revisión o la entrega cambió. Se recargó la información; revisa antes de decidir.';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Forma común del detalle vivo o histórico (tras aprobar, el backend devuelve el histórico). */
interface Cabecera {
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  lider: { idUsuario: number; nombre: string; apellido: string };
  miembros: Array<{ key: number; usuario: { nombre: string; apellido: string }; rol: string; participacion: string }>;
  sprints: Array<{ idSprint: number; numero: number; estado: string; fechaInicio?: string | null; fechaCierre?: string | null }>;
}

function DisabledWithTooltip({ reason, children }: { reason: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex w-full rounded-lg sm:w-auto">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

// ─── Diálogo de veredicto ────────────────────────────────────────────────────
function VerdictDialog({
  veredicto,
  revision,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: {
  veredicto: Veredicto | null;
  revision: ClosureRevision | null;
  pending: boolean;
  error: string | null;
  onConfirm: (comentario: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [comentario, setComentario] = useState('');
  const meta = veredicto ? VEREDICTO_META[veredicto] : null;
  const valido = comentario.length <= COMENTARIO_VEREDICTO_MAX && (!meta?.obligatorio || comentario.trim().length > 0);

  const cerrar = (open: boolean) => {
    if (!open) setComentario('');
    onOpenChange(open);
  };

  return (
    <Dialog open={veredicto != null} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-lg">
        {meta && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{meta.titulo}</DialogTitle>
              <DialogDescription>{meta.descripcion}</DialogDescription>
            </DialogHeader>
            {revision && (
              <p className="text-xs text-tertiary">
                Envío #{revision.numeroRevision} · {formatearFecha(revision.enviadaEn)}
              </p>
            )}
            <div>
              <Label htmlFor={`${id}-comentario`} className="text-xs font-semibold text-on-surface">
                {meta.etiquetaComentario} {meta.obligatorio && <span aria-hidden="true">*</span>}
              </Label>
              <Textarea
                id={`${id}-comentario`}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={COMENTARIO_VEREDICTO_MAX}
                required={meta.obligatorio}
                aria-required={meta.obligatorio}
                rows={4}
                autoFocus
                className="mt-1 text-sm"
              />
              <p className="mt-1 text-right type-micro text-tertiary" aria-live="polite">
                {comentario.length}/{COMENTARIO_VEREDICTO_MAX}
              </p>
              {error && (
                <p role="alert" className="mt-1 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={pending} className="rounded-lg">
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => onConfirm(comentario.trim())}
                disabled={!valido || pending}
                className={`gap-1.5 rounded-lg ${
                  veredicto === 'DEVOLVER'
                    ? 'bg-error text-on-error hover:bg-error/90'
                    : veredicto === 'CORREGIR'
                      ? 'bg-attention text-on-attention hover:bg-attention-strong'
                      : ''
                }`}
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {meta.confirmar}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewSkeleton() {
  return (
    <div className={`${PAGE} pb-12 pt-8`} aria-busy="true">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-28 w-full rounded-card" />
      <Skeleton className="mb-4 h-56 w-full rounded-card" />
      <Skeleton className="h-56 w-full rounded-card" />
    </div>
  );
}

export interface ClosureReviewClientProps {
  id: number;
}

/**
 * VIEW-14 (F016) — revisión administrativa del cierre con los tres veredictos.
 * Todo se compone con lo ya creado: `ClosureReadinessPanel` (fase APPROVE),
 * `ClosureDocumentsManager` en `readOnly` (el administrador no sube ni borra
 * evidencias, ni regenera el informe) y el visor protegido. La entrega
 * revisable es la revisión `ENVIADA`; `expectedFingerprint` es SU
 * `fingerprintEntrega`.
 */
export default function ClosureReviewClient({ id }: ClosureReviewClientProps) {
  const detalle = useAdminProjectDetail(id);
  const estado = detalle.data ? (isHistoricalDetail(detalle.data) ? detalle.data.resumen.estadoProyecto : detalle.data.resumen.estadoProyecto) : null;
  const enSolicitud = estado === 'EN_SOLICITUD_CIERRE';
  const readiness = useCloseReadiness(id, 'APPROVE', enSolicitud);
  const revisiones = useClosureRevisions(id, 1, Boolean(detalle.data));
  const enviadaResumen = findRevisionEnviada(revisiones.data?.items);
  const revisionDetalle = useClosureRevision(id, enviadaResumen?.numeroRevision ?? null);
  const revision = revisionDetalle.data ?? enviadaResumen;
  const { devolver, corregir, aprobar, invalidateAll } = useClosureReview(id);

  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);
  const [errorVeredicto, setErrorVeredicto] = useState<string | null>(null);

  const pending = devolver.isPending || corregir.isPending || aprobar.isPending;

  if (detalle.isPending) return <ReviewSkeleton />;

  if (detalle.isError || !detalle.data) {
    const status = getApiErrorStatus(detalle.error);
    return (
      <div className={`${PAGE} pb-12 pt-8`}>
        <Empty tone={status === 404 ? 'muted' : 'danger'} role={status === 404 ? 'status' : 'alert'}>
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{status === 404 ? 'El proyecto ya no existe.' : getApiErrorMessage(detalle.error, 'closure')}</EmptyTitle>
            <EmptyDescription>Vuelve a las solicitudes de cierre para continuar.</EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm">
            <Link href={adminProjectsGroupHref('cierres')}>Volver a Solicitudes de cierre</Link>
          </Button>
        </Empty>
      </div>
    );
  }

  const data = detalle.data;
  const cabecera: Cabecera = isHistoricalDetail(data)
    ? {
        titulo: data.resumen.tituloProyecto,
        descripcion: data.resumen.descripcionProyecto,
        tipo: data.resumen.tipoProyecto,
        estado: data.resumen.estadoProyecto,
        lider: data.liderazgo.liderActual,
        miembros: data.miembrosHistoricos.map((m) => ({ key: m.idParticipacion, usuario: m.usuario, rol: m.rol.nombreRol, participacion: m.estadoParticipacion })),
        sprints: data.sprintsCerrados.map((s) => ({ ...s, estado: 'CERRADO' })),
      }
    : {
        titulo: data.resumen.tituloProyecto,
        descripcion: data.resumen.descripcionProyecto,
        tipo: data.resumen.tipoProyecto,
        estado: data.resumen.estadoProyecto,
        lider: data.liderazgo.liderActual,
        miembros: data.miembros.map((m) => ({ key: m.idParticipacion, usuario: m.usuario, rol: m.rolProyecto.nombreRol, participacion: m.estadoParticipacion })),
        sprints: data.sprints,
      };

  const revisable = enSolicitud && revision != null && revision.estadoRevision === 'ENVIADA';
  const motivoBloqueo = !enSolicitud
    ? 'El proyecto ya no está en solicitud de cierre; esta superficie es de solo lectura.'
    : revisiones.isPending
      ? 'Cargando la entrega…'
      : 'No hay una entrega ENVIADA pendiente de revisión.';
  const ultimaRevision = revisiones.data?.items.slice().sort((a, b) => b.numeroRevision - a.numeroRevision)[0] ?? null;
  const evidencias = revision?.documentosEnviados.filter((d) => d.tipoDocumento === 'EVIDENCIA_LIDER').length ?? 0;
  const informe = revision?.documentosEnviados.find((d) => d.tipoDocumento === 'INFORME_AUTOMATICO') ?? null;
  // Solo informativo: el servidor vuelve a evaluar las comprobaciones al aprobar.
  const comprobacionesPendientes =
    enSolicitud && readiness.data ? TOTAL_CLOSURE_CHECKS - countPassedChecks(readiness.data.blockers) : 0;

  const manejarError = (err: unknown, tipo: Veredicto) => {
    const status = getApiErrorStatus(err);
    if (status === 409) {
      setVeredicto(null);
      setErrorVeredicto(null);
      invalidateAll();
      void uvgSwal.fire({ icon: 'warning', title: 'La revisión cambió', text: MSG_409 });
      return;
    }
    if (status === 503 && tipo === 'APROBAR') {
      setErrorVeredicto(MSG_503_APROBACION);
      return;
    }
    setErrorVeredicto(getApiErrorMessage(err, 'closure'));
  };

  const confirmar = (comentario: string) => {
    if (!veredicto || !revision || pending) return;
    setErrorVeredicto(null);
    const tipo = veredicto;
    const onSuccess = () => {
      setVeredicto(null);
      void uvgSwal.fire({ icon: 'success', title: VEREDICTO_META[tipo].titulo, text: VEREDICTO_META[tipo].exito, timer: 2500, showConfirmButton: false });
    };
    const onError = (err: unknown) => manejarError(err, tipo);
    if (tipo === 'DEVOLVER') {
      devolver.mutate({ revisionId: revision.idRevisionCierre, comentario }, { onSuccess, onError });
    } else if (tipo === 'CORREGIR') {
      corregir.mutate({ revisionId: revision.idRevisionCierre, comentario }, { onSuccess, onError });
    } else {
      if (!revision.fingerprintEntrega) {
        setErrorVeredicto('La entrega no tiene huella sellada; no puede aprobarse. Devuelve el proyecto a ejecución.');
        return;
      }
      aprobar.mutate(
        { revisionId: revision.idRevisionCierre, expectedFingerprint: revision.fingerprintEntrega, comentario: comentario || undefined },
        { onSuccess, onError },
      );
    }
  };

  const abrir = (tipo: Veredicto) => {
    setErrorVeredicto(null);
    setVeredicto(tipo);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className={`${PAGE} flex-1 pb-8 pt-8`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Breadcrumb>
            <BreadcrumbList className="text-sm">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={adminProjectsGroupHref('activos')} className="text-tertiary hover:text-on-surface">
                    Proyectos
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={adminProjectsGroupHref('cierres')} className="text-tertiary hover:text-on-surface">
                    Solicitudes de cierre
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-xs truncate font-medium text-on-surface">{cabecera.titulo}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Cabecera */}
        <header className="card-base mb-4">
          <div className="flex flex-col gap-stack lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="type-display break-words text-text-primary">{cabecera.titulo}</h1>
              <dl className="mt-inline flex flex-wrap gap-x-card gap-y-tight">
                <div>
                  <dt className="type-meta">Líder</dt>
                  <dd className="type-body font-medium text-text-primary">
                    {cabecera.lider.nombre} {cabecera.lider.apellido}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta">Tipo</dt>
                  <dd className="type-body font-medium text-text-primary">{tipoBadgeLabel(cabecera.tipo)}</dd>
                </div>
                <div>
                  <dt className="type-meta">Entrega</dt>
                  <dd className="type-body font-medium tabular-nums text-text-primary">
                    {revision
                      ? `Envío #${revision.numeroRevision} · ${formatearFecha(revision.enviadaEn)}`
                      : ultimaRevision
                        ? `Última revisión #${ultimaRevision.numeroRevision}`
                        : 'Sin entrega'}
                  </dd>
                </div>
              </dl>
            </div>
            <span className={`pill shrink-0 ${estadoBadgeStyle(cabecera.estado)}`}>
              {estadoBadgeLabel(cabecera.estado)}
            </span>
          </div>
        </header>

        {!enSolicitud && (
          <div
            role="status"
            className="type-body mb-4 flex flex-wrap items-center gap-inline rounded-card border border-outline-variant/50 bg-surface-container-low px-card py-inline text-text-secondary"
          >
            <span className="min-w-0 flex-1">
              {cabecera.estado === 'CERRADO'
                ? 'Este proyecto ya está cerrado. La revisión se muestra en solo lectura.'
                : 'Este proyecto ya no está en solicitud de cierre. La revisión se muestra en solo lectura.'}
            </span>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold">
              <Link href={`/dashboard/admin/proyectos/${id}`}>Ver detalle del proyecto</Link>
            </Button>
          </div>
        )}

        {ultimaRevision?.comentarioRevisor && ultimaRevision.estadoRevision !== 'ENVIADA' && (
          <div className="mb-4 rounded-card border border-outline-variant/50 bg-surface-container-low px-card py-inline">
            <span className="pill pill-sm pill-amber">Último veredicto</span>
            <p className="type-body mt-tight whitespace-pre-wrap text-text-primary">{ultimaRevision.comentarioRevisor}</p>
          </div>
        )}

        {/* Verificación */}
        {enSolicitud && (
          <div className="mb-4">
            <ClosureReadinessPanel
              summary={readiness.data}
              isLoading={readiness.isPending}
              title="Verificación"
              description="Cumplimiento de los requisitos de cierre, por categoría."
              audiencia="revisor"
              showProgress
            />
            {readiness.isError && (
              <p role="alert" className="mt-2 text-xs text-error">
                {getApiErrorMessage(readiness.error, 'closure')}
              </p>
            )}
          </div>
        )}

        <Tabs defaultValue="documentos">
          <TabsList className={ADMIN_TAB_LIST} aria-label="Secciones de la revisión">
            <TabsTrigger value="documentos" className={ADMIN_TAB_TRIGGER}>
              Documentos
            </TabsTrigger>
            <TabsTrigger value="resumen" className={ADMIN_TAB_TRIGGER}>
              Resumen
            </TabsTrigger>
            <TabsTrigger value="miembros" className={ADMIN_TAB_TRIGGER}>
              Miembros
            </TabsTrigger>
            <TabsTrigger value="sprints" className={ADMIN_TAB_TRIGGER}>
              Sprints
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documentos" className="mt-4">
            {revisiones.isError ? (
              <p role="alert" className="card-base text-sm text-error">
                {getApiErrorMessage(revisiones.error, 'closure')}
              </p>
            ) : revision || revisiones.isPending || revisionDetalle.isPending ? (
              <ClosureDocumentsManager
                projectId={id}
                revision={revision ?? undefined}
                isLoading={revisiones.isPending || (enviadaResumen != null && revisionDetalle.isPending && !revisionDetalle.data)}
                readOnly
                allowGenerate={false}
                fechaInforme={revision?.enviadaEn ?? null}
              />
            ) : (
              <div className="card-base type-body text-text-secondary">No hay una entrega enviada para revisar.</div>
            )}
          </TabsContent>

          <TabsContent value="resumen" className="mt-4">
            <section className="card-base" aria-labelledby="resumen-entrega-titulo">
              <h2 id="resumen-entrega-titulo" className="type-section text-text-primary">
                Resumen
              </h2>
              <p className="type-body mt-tight max-w-prose whitespace-pre-wrap text-text-secondary">
                {cabecera.descripcion || 'Sin descripción disponible.'}
              </p>
              <dl className="mt-stack grid grid-cols-2 gap-x-card gap-y-stack border-t border-outline-variant/50 pt-stack sm:grid-cols-4">
                <div>
                  <dt className="type-meta">Entrega</dt>
                  <dd className="type-subtitle mt-micro font-semibold tabular-nums text-text-primary">
                    {revision ? `#${revision.numeroRevision}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta">Evidencias adjuntas</dt>
                  <dd className="type-subtitle mt-micro font-semibold tabular-nums text-text-primary">{evidencias}</dd>
                  <dd className="type-meta">Máximo {MAX_EVIDENCIAS}</dd>
                </div>
                <div>
                  <dt className="type-meta">Integrantes activos</dt>
                  <dd className="type-subtitle mt-micro font-semibold tabular-nums text-text-primary">
                    {cabecera.miembros.filter((m) => m.participacion === 'ACTIVO').length}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta">Sprints cerrados</dt>
                  <dd className="type-subtitle mt-micro font-semibold tabular-nums text-text-primary">
                    {cabecera.sprints.filter((s) => s.estado === 'CERRADO').length}
                  </dd>
                </div>
              </dl>
              {revision && (
                <details className="group mt-stack border-t border-outline-variant/50 pt-inline">
                  <summary className="type-meta flex w-fit cursor-pointer list-none items-center gap-micro rounded-control font-semibold outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
                    Datos técnicos de auditoría
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <dl className="mt-tight space-y-tight">
                    <div>
                      <dt className="type-meta">Identificador interno de la revisión</dt>
                      <dd className="type-meta font-mono text-text-primary">{revision.idRevisionCierre}</dd>
                    </div>
                    {revision.fingerprintEntrega && (
                      <div>
                        <dt className="type-meta">Huella de la entrega</dt>
                        <dd className="type-meta break-all font-mono text-text-primary">{revision.fingerprintEntrega}</dd>
                      </div>
                    )}
                    {informe?.checksumSha256 && (
                      <div>
                        <dt className="type-meta">SHA-256 del informe automático</dt>
                        <dd className="type-meta break-all font-mono text-text-primary">{informe.checksumSha256}</dd>
                      </div>
                    )}
                  </dl>
                </details>
              )}
            </section>
          </TabsContent>

          <TabsContent value="miembros" className="mt-4">
            <div className={DATA_TABLE_CARD}>
              {cabecera.miembros.length === 0 ? (
                <p className="type-body px-card py-card text-text-secondary">Sin integrantes registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                        <TableHead className={TH}>Integrante</TableHead>
                        <TableHead className={TH}>Rol</TableHead>
                        <TableHead className={TH}>Participación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cabecera.miembros.map((m) => (
                        <TableRow key={m.key} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                          <TableCell className={TD}>
                            <span className="type-body inline-flex items-center gap-2 font-medium text-text-primary">
                              <Avatar className="size-7">
                                <AvatarFallback className="bg-primary/10 type-micro font-bold text-primary">
                                  {getInitials(m.usuario.nombre, m.usuario.apellido)}
                                </AvatarFallback>
                              </Avatar>
                              {m.usuario.nombre} {m.usuario.apellido}
                            </span>
                          </TableCell>
                          <TableCell className={TD}>
                            <Badge variant="secondary">{m.rol}</Badge>
                          </TableCell>
                          <TableCell className={TD}>
                            <span
                              className={`pill pill-sm ${ESTADO_PARTICIPACION_STYLE[m.participacion as EstadoParticipacion]?.className ?? 'pill-neutral'}`}
                            >
                              {ESTADO_PARTICIPACION_LABEL[m.participacion] ?? m.participacion}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sprints" className="mt-4">
            <section className="card-base" aria-labelledby="sprints-cerrados-titulo">
              <h2 id="sprints-cerrados-titulo" className="type-section text-text-primary">
                Sprints cerrados
              </h2>
              <p className="type-meta mt-micro">
                En solicitud de cierre no existe Sprint operable; todos los Sprints deben estar cerrados.
              </p>
              {cabecera.sprints.length === 0 ? (
                <p className="type-body mt-stack text-text-secondary">Aún no hay Sprints cerrados.</p>
              ) : (
                <ul className="mt-inline divide-y divide-outline-variant/50" aria-label="Sprints cerrados">
                  {cabecera.sprints.map((s) => {
                    const estilo = ESTADO_SPRINT_STYLE[s.estado as EstadoSprint];
                    return (
                      <li key={s.idSprint} className="flex flex-wrap items-center gap-inline py-tight">
                        <span className="type-body font-semibold text-text-primary">Sprint {s.numero}</span>
                        {(s.fechaInicio || s.fechaCierre) && (
                          <span className="type-meta tabular-nums">
                            {formatearFecha(s.fechaInicio)}
                            {s.fechaCierre ? ` → ${formatearFecha(s.fechaCierre)}` : ''}
                          </span>
                        )}
                        <span className={`pill pill-sm ml-auto ${estilo?.className ?? 'pill-neutral'}`}>
                          {estilo?.label ?? s.estado}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      {/* Barra inferior fija con los tres veredictos. `sticky` dentro del área
          desplazable: sigue el ancho real del contenido (sidebar abierta o
          plegada). En móvil el área ya reserva 80 px para la navegación
          inferior (64 px): `-bottom-4` deja la barra pegada a ella. */}
      <div
        role="region"
        aria-label="Veredictos de la revisión"
        className="sticky -bottom-4 z-20 border-t border-outline-variant/50 bg-surface-container-lowest/95 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0"
      >
        <div className={`${PAGE} grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end`}>
          {!revisable ? (
            <p className="type-meta col-span-2 min-w-0 sm:flex-1">{motivoBloqueo}</p>
          ) : (
            comprobacionesPendientes > 0 && (
              <p className="type-meta col-span-2 flex min-w-0 flex-wrap items-center gap-tight sm:flex-1" data-slot="veredicto-pendientes">
                <span className="pill pill-sm pill-amber tabular-nums">
                  {comprobacionesPendientes === 1 ? '1 pendiente' : `${comprobacionesPendientes} pendientes`}
                </span>
                La aprobación se rechazará mientras existan comprobaciones pendientes.
              </p>
            )
          )}
          {(
            [
              { tipo: 'DEVOLVER' as Veredicto, label: 'Devolver a ejecución', className: 'border-error/50 text-error hover:bg-error/10 hover:text-error', variant: 'outline' as const, ancho: '' },
              {
                tipo: 'CORREGIR' as Veredicto,
                label: 'Solicitar corrección documental',
                className:
                  'border-attention/60 text-attention-strong hover:bg-attention/10 hover:text-attention-strong dark:text-on-tag-amber dark:hover:text-on-tag-amber',
                variant: 'outline' as const,
                ancho: '',
              },
              { tipo: 'APROBAR' as Veredicto, label: 'Aprobar cierre', className: '', variant: 'default' as const, ancho: 'col-span-2' },
            ] as const
          ).map(({ tipo, label, className, variant, ancho }) => {
            const boton = (
              <Button
                type="button"
                variant={variant}
                disabled={!revisable || pending}
                onClick={() => abrir(tipo)}
                className={`h-auto min-h-10 w-full whitespace-normal rounded-lg px-3 py-1.5 text-[13px] font-bold leading-tight sm:w-auto sm:px-4 sm:text-sm ${className}`}
              >
                {label}
              </Button>
            );
            return revisable ? (
              <span key={tipo} className={`inline-flex w-full sm:w-auto sm:shrink-0 ${ancho}`}>
                {boton}
              </span>
            ) : (
              <span key={tipo} className={`inline-flex w-full sm:w-auto sm:shrink-0 ${ancho}`}>
                <DisabledWithTooltip reason={motivoBloqueo}>{boton}</DisabledWithTooltip>
              </span>
            );
          })}
        </div>
      </div>

      <VerdictDialog
        veredicto={veredicto}
        revision={revision}
        pending={pending}
        error={errorVeredicto}
        onConfirm={confirmar}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setVeredicto(null);
            setErrorVeredicto(null);
          }
        }}
      />
    </div>
  );
}
