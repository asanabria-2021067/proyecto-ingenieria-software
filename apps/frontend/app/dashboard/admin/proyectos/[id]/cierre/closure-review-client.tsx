'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  FolderOpen,
  Layers,
  ListChecks,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Undo2,
  User,
  Users,
} from 'lucide-react';
import { useAdminProjectDetail } from '@/hooks/use-admin-projects';
import { useCloseReadiness, useClosureRevision, useClosureRevisions } from '@/hooks/use-closure';
import { findRevisionEnviada, useClosureReview } from '@/hooks/use-closure-review';
import { isHistoricalDetail } from '@/lib/services/admin-projects';
import { COMENTARIO_VEREDICTO_MAX } from '@/lib/services/closure-review';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle, tipoBadgeLabel } from '@/components/projects/available-project-card';
import { adminProjectsGroupHref } from '@/components/admin-projects/admin-projects-tabs';
import { ClosureReadinessPanel } from '@/components/closure/closure-readiness-panel';
import { ClosureDocumentsManager } from '@/components/closure/closure-documents-manager';
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
import type { ClosureRevision } from '@/lib/types/closure';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';
const TAB_TRIGGER =
  'rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[13px] font-bold data-[state=active]:border-primary data-[state=active]:shadow-none';

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
              <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
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
                      ? 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-400 dark:text-amber-950'
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
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-32 w-full rounded-xl" />
      <Skeleton className="mb-4 h-64 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
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

  const actualizar = () => {
    invalidateAll();
  };

  if (detalle.isPending) return <ReviewSkeleton />;

  if (detalle.isError || !detalle.data) {
    const status = getApiErrorStatus(detalle.error);
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
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
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-8 md:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList className="text-[13px]">
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
        <Button type="button" variant="outline" size="sm" onClick={actualizar} className="h-9 gap-1.5 rounded-lg text-xs font-semibold">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      {/* Cabecera */}
      <header className={`${CARD} mb-4`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-black leading-tight text-on-surface md:text-[28px]">{cabecera.titulo}</h1>
            <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-on-surface-variant">
              <div className="flex items-center gap-1.5">
                <User className="size-4 text-tertiary" aria-hidden="true" />
                <dt className="sr-only">Líder</dt>
                <dd>
                  {cabecera.lider.nombre} {cabecera.lider.apellido}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <FolderOpen className="size-4 text-tertiary" aria-hidden="true" />
                <dt className="sr-only">Tipo</dt>
                <dd>{tipoBadgeLabel(cabecera.tipo)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-tertiary" aria-hidden="true" />
                <dt className="sr-only">Envío</dt>
                <dd>
                  {revision
                    ? `Envío #${revision.numeroRevision} · ${formatearFecha(revision.enviadaEn)}`
                    : ultimaRevision
                      ? `Última revisión #${ultimaRevision.numeroRevision}`
                      : 'Sin entrega'}
                </dd>
              </div>
            </dl>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${estadoBadgeStyle(cabecera.estado)}`}>
            {estadoBadgeLabel(cabecera.estado)}
          </span>
        </div>
      </header>

      {!enSolicitud && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-sm text-on-surface">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <span className="flex-1">
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
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-sm text-on-surface">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">Último veredicto</p>
          <p className="mt-1 whitespace-pre-wrap">{ultimaRevision.comentarioRevisor}</p>
        </div>
      )}

      {/* Verificación */}
      {enSolicitud && (
        <div className="mb-4">
          <ClosureReadinessPanel
            summary={readiness.data}
            isLoading={readiness.isPending}
            title="Verificación"
            description="Revisa el cumplimiento de todos los requisitos para el cierre del proyecto."
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
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-outline-variant/50 bg-transparent p-0">
          <TabsTrigger value="documentos" className={TAB_TRIGGER}>
            <FileText className="mr-1.5 size-4" aria-hidden="true" />
            Documentos
          </TabsTrigger>
          <TabsTrigger value="resumen" className={TAB_TRIGGER}>
            <ListChecks className="mr-1.5 size-4" aria-hidden="true" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="miembros" className={TAB_TRIGGER}>
            <Users className="mr-1.5 size-4" aria-hidden="true" />
            Miembros
          </TabsTrigger>
          <TabsTrigger value="sprints" className={TAB_TRIGGER}>
            <Layers className="mr-1.5 size-4" aria-hidden="true" />
            Sprints
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="mt-4">
          {revisiones.isError ? (
            <p role="alert" className={`${CARD} text-sm text-error`}>
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
            <div className={`${CARD} text-sm text-tertiary`}>No hay una entrega enviada para revisar.</div>
          )}
        </TabsContent>

        <TabsContent value="resumen" className="mt-4">
          <div className={CARD}>
            <h2 className="mb-3 font-headline text-xs font-black uppercase tracking-widest text-tertiary">Resumen</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{cabecera.descripcion || 'Sin descripción disponible.'}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/40 pt-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[11px] text-tertiary">Entrega</dt>
                <dd className="font-semibold text-on-surface">{revision ? `#${revision.numeroRevision}` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-tertiary">Evidencias</dt>
                <dd className="font-semibold text-on-surface">{evidencias} de 10</dd>
              </div>
              <div>
                <dt className="text-[11px] text-tertiary">Integrantes activos</dt>
                <dd className="font-semibold text-on-surface">{cabecera.miembros.filter((m) => m.participacion === 'ACTIVO').length}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-tertiary">Sprints cerrados</dt>
                <dd className="font-semibold text-on-surface">{cabecera.sprints.filter((s) => s.estado === 'CERRADO').length}</dd>
              </div>
            </dl>
            {revision?.fingerprintEntrega && (
              <p className="mt-3 break-all text-[11px] text-tertiary">
                Huella de la entrega: <code className="font-mono">{revision.fingerprintEntrega}</code>
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="miembros" className="mt-4">
          <div className={`${CARD} p-0`}>
            {cabecera.miembros.length === 0 ? (
              <p className="px-5 py-6 text-sm italic text-tertiary">Sin integrantes registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Integrante</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Rol</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Participación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cabecera.miembros.map((m) => (
                      <TableRow key={m.key} className="border-outline-variant/40">
                        <TableCell className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-on-surface">
                            <Avatar className="size-7">
                              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                {getInitials(m.usuario.nombre, m.usuario.apellido)}
                              </AvatarFallback>
                            </Avatar>
                            {m.usuario.nombre} {m.usuario.apellido}
                          </span>
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          <Badge className="border-transparent bg-primary/10 text-[11px] font-semibold text-primary">{m.rol}</Badge>
                        </TableCell>
                        <TableCell className="px-5 py-3 text-sm text-on-surface-variant">
                          {ESTADO_PARTICIPACION_LABEL[m.participacion] ?? m.participacion}
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
          <div className={CARD}>
            <h2 className="mb-1 text-base font-bold text-on-surface">Sprints cerrados</h2>
            <p className="mb-4 text-xs text-tertiary">En solicitud de cierre no existe Sprint operable; todos los Sprints deben estar cerrados.</p>
            {cabecera.sprints.length === 0 ? (
              <p className="text-sm italic text-tertiary">Aún no hay Sprints cerrados.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/30" aria-label="Sprints cerrados">
                {cabecera.sprints.map((s) => (
                  <li key={s.idSprint} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="font-medium text-on-surface">Sprint {s.numero}</span>
                    {(s.fechaInicio || s.fechaCierre) && (
                      <span className="text-on-surface-variant">
                        {formatearFecha(s.fechaInicio)}
                        {s.fechaCierre ? ` – ${formatearFecha(s.fechaCierre)}` : ''}
                      </span>
                    )}
                    <Badge variant="outline" className="ml-auto text-[10px] text-tertiary">
                      {s.estado === 'CERRADO' ? 'Cerrado' : s.estado}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer sticky con los tres veredictos */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container-lowest/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:left-64 md:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!revisable && (
            <p className="flex items-center gap-1.5 text-xs text-tertiary sm:mr-auto">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {motivoBloqueo}
            </p>
          )}
          {(
            [
              { tipo: 'DEVOLVER' as Veredicto, icon: Undo2, label: 'Devolver a ejecución', className: 'border-error/50 text-error hover:bg-error/10 hover:text-error', variant: 'outline' as const },
              {
                tipo: 'CORREGIR' as Veredicto,
                icon: MessageSquareWarning,
                label: 'Solicitar corrección documental',
                className: 'border-amber-500/60 text-amber-800 hover:bg-amber-400/10 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100',
                variant: 'outline' as const,
              },
              { tipo: 'APROBAR' as Veredicto, icon: CheckCircle2, label: 'Aprobar cierre', className: '', variant: 'default' as const },
            ] as const
          ).map(({ tipo, icon: Icon, label, className, variant }) => {
            const boton = (
              <Button
                type="button"
                variant={variant}
                disabled={!revisable || pending}
                onClick={() => abrir(tipo)}
                className={`h-10 w-full gap-1.5 rounded-lg text-sm font-bold sm:w-auto ${className}`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Button>
            );
            return revisable ? (
              <span key={tipo} className="inline-flex w-full sm:w-auto">
                {boton}
              </span>
            ) : (
              <DisabledWithTooltip key={tipo} reason={motivoBloqueo}>
                {boton}
              </DisabledWithTooltip>
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
