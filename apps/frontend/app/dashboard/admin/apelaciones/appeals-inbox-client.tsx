'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Gavel, Loader2, X } from 'lucide-react';
import { useAdminAppeals, useDenyAppeal, useLeadershipCandidates } from '@/hooks/use-leadership';
import { acceptAppeal } from '@/lib/services/leadership';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { LeadershipChangeDialog } from '@/components/leadership/leadership-change-dialog';
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
import { Textarea } from '@/components/ui/textarea';
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
import {
  MENSAJE_RESOLUCION_MAX,
  motivoInelegibilidadLabel,
  type ApelacionItemDto,
  type TransferLeadershipInput,
} from '@/lib/types/leadership';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

const FILTROS = [
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'ACEPTADA', label: 'Aceptadas' },
  { value: 'DENEGADA', label: 'Denegadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
] as const;
type Filtro = (typeof FILTROS)[number]['value'];

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-amber-400/15 text-amber-800 dark:text-amber-200' },
  ACEPTADA: { label: 'Aceptada', className: 'bg-primary/10 text-primary' },
  DENEGADA: { label: 'Denegada', className: 'bg-error/10 text-error' },
  CANCELADA: { label: 'Cancelada', className: 'bg-surface-container-high text-on-surface-variant' },
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

export function parseFiltro(value: string | null): Filtro {
  return (FILTROS.some((f) => f.value === value) ? value : 'PENDIENTE') as Filtro;
}

function hrefFiltro(filtro: Filtro, page = 1): string {
  const params = new URLSearchParams();
  params.set('estado', filtro);
  if (page > 1) params.set('page', String(page));
  return `/dashboard/admin/apelaciones?${params.toString()}`;
}

// ─── Panel de una apelación ──────────────────────────────────────────────────
function AppealPanel({
  apelacion,
  onAceptar,
  onDenegar,
}: {
  apelacion: ApelacionItemDto;
  onAceptar: () => void;
  onDenegar: () => void;
}) {
  const pendiente = apelacion.estadoApelacion === 'PENDIENTE';
  const candidatos = useLeadershipCandidates(apelacion.idProyecto, pendiente);
  const candidato = candidatos.data?.candidatos.find((c) => c.idUsuario === apelacion.candidatoPropuesto.idUsuario) ?? null;
  const estado = ESTADO_BADGE[apelacion.estadoApelacion] ?? { label: apelacion.estadoApelacion, className: 'bg-surface-container-high text-on-surface-variant' };

  return (
    <section aria-label={`Apelación #${apelacion.idApelacion}`} className={`${CARD} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-tertiary">Apelación #{apelacion.idApelacion}</p>
          <h2 className="mt-1 text-lg font-bold text-on-surface">{apelacion.asunto}</h2>
          <p className="text-xs text-tertiary">
            Proyecto{' '}
            <Link href={`/dashboard/admin/proyectos/${apelacion.idProyecto}`} className="font-semibold text-primary hover:underline">
              #{apelacion.idProyecto}
            </Link>{' '}
            · enviada el {formatearFecha(apelacion.creadaEn)}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${estado.className}`}>{estado.label}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-outline-variant/40 p-3">
          <p className="text-[11px] text-tertiary">Líder solicitante</p>
          <p className="text-sm font-semibold text-on-surface">
            {apelacion.liderSolicitante.nombre} {apelacion.liderSolicitante.apellido}
          </p>
        </div>
        <div className="rounded-lg border border-outline-variant/40 p-3">
          <p className="text-[11px] text-tertiary">Candidato propuesto</p>
          <p className="text-sm font-semibold text-on-surface">
            {apelacion.candidatoPropuesto.nombre} {apelacion.candidatoPropuesto.apellido}
          </p>
          {pendiente && candidato && (
            <p className="mt-1 text-[11px] text-on-surface-variant">
              {candidato.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol'} · {candidato.tareasDistintas}{' '}
              {candidato.tareasDistintas === 1 ? 'tarea' : 'tareas'} · {formatearDecimal(candidato.horasReportadas)} h reportadas
              {!candidato.seleccionable && (
                <span className="block text-error">
                  No elegible: {candidato.motivos.map(motivoInelegibilidadLabel).join('; ') || 'sin motivo'}
                </span>
              )}
            </p>
          )}
          {pendiente && (
            <p className="mt-1 text-[11px] text-tertiary">Es una propuesta: al aceptar puedes elegir otro candidato elegible.</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-tertiary">Mensaje</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface">{apelacion.mensaje}</p>
      </div>

      {!pendiente && (
        <div className="rounded-lg bg-surface-container-low p-3 text-sm">
          <p className="text-[11px] text-tertiary">Resolución</p>
          <p className="text-on-surface">
            {apelacion.adminResolutor
              ? `${apelacion.adminResolutor.nombre} ${apelacion.adminResolutor.apellido}`
              : 'Sin resolutor'}{' '}
            · {formatearFecha(apelacion.resueltaEn)}
          </p>
          {apelacion.mensajeResolucion && <p className="mt-1 whitespace-pre-wrap text-on-surface-variant">{apelacion.mensajeResolucion}</p>}
        </div>
      )}

      {pendiente && (
        <div className="flex flex-col gap-2 border-t border-outline-variant/40 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onDenegar}
            className="h-10 w-full gap-1.5 rounded-lg border-error/40 text-sm font-semibold text-error hover:bg-error/10 hover:text-error sm:w-auto"
          >
            <X className="size-4" aria-hidden="true" />
            Denegar
          </Button>
          <Button type="button" onClick={onAceptar} className="h-10 w-full gap-1.5 rounded-lg text-sm font-bold sm:w-auto">
            <Check className="size-4" aria-hidden="true" />
            Aceptar y transferir
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── Diálogo de denegación ───────────────────────────────────────────────────
function DenyDialog({
  apelacion,
  open,
  onOpenChange,
}: {
  apelacion: ApelacionItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deny = useDenyAppeal();
  const valido = mensaje.trim().length > 0 && mensaje.length <= MENSAJE_RESOLUCION_MAX;

  const cerrar = (siguiente: boolean) => {
    if (!siguiente) {
      setMensaje('');
      setError(null);
      deny.reset();
    }
    onOpenChange(siguiente);
  };

  const confirmar = () => {
    if (!apelacion || !valido || deny.isPending) return;
    setError(null);
    deny.mutate(
      { idProyecto: apelacion.idProyecto, idApelacion: apelacion.idApelacion, input: { mensajeResolucion: mensaje.trim() } },
      {
        onSuccess: () => {
          cerrar(false);
          void uvgSwal.fire({ icon: 'success', title: 'Apelación denegada', timer: 2000, showConfirmButton: false });
        },
        onError: (err) => {
          if (getApiErrorStatus(err) === 409) {
            cerrar(false);
            void uvgSwal.fire({ icon: 'info', title: 'La apelación ya fue resuelta', text: getApiErrorMessage(err, 'admin') });
            return;
          }
          setError(getApiErrorMessage(err, 'admin'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Denegar apelación</DialogTitle>
          <DialogDescription>
            El liderazgo no cambia. El mensaje de resolución se muestra al líder solicitante.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor={`${id}-mensaje`} className="text-xs font-semibold text-on-surface">
            Mensaje de resolución <span aria-hidden="true">*</span>
          </Label>
          <Textarea
            id={`${id}-mensaje`}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={MENSAJE_RESOLUCION_MAX}
            required
            aria-required="true"
            rows={4}
            autoFocus
            placeholder="Explica por qué se deniega la apelación…"
            className="mt-1 text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
            {mensaje.length}/{MENSAJE_RESOLUCION_MAX}
          </p>
          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={deny.isPending} className="rounded-lg">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={!valido || deny.isPending}
            className="gap-1.5 rounded-lg bg-error text-on-error hover:bg-error/90"
          >
            {deny.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Denegar apelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
/**
 * VIEW-18 (F015) — bandeja administrativa de apelaciones de liderazgo. Solo
 * las PENDIENTES son resolubles: Aceptar reutiliza `LeadershipChangeDialog`
 * (mismo CAS `expectedLeaderId`, candidato precargado y editable) por el
 * endpoint de aceptación; Denegar exige `mensajeResolucion`.
 */
export default function AppealsInboxClient() {
  const searchParams = useSearchParams();
  const filtro = parseFiltro(searchParams.get('estado'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const estado = filtro === 'TODAS' ? undefined : filtro;

  const { data, isPending, isError, error, refetch } = useAdminAppeals(estado, page);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [aceptando, setAceptando] = useState<ApelacionItemDto | null>(null);
  const [denegando, setDenegando] = useState<ApelacionItemDto | null>(null);

  const items = data?.items ?? [];
  const seleccionada = items.find((a) => a.idApelacion === seleccionadaId) ?? null;
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const submitAceptar = (apelacion: ApelacionItemDto) => (input: TransferLeadershipInput) =>
    acceptAppeal(apelacion.idProyecto, apelacion.idApelacion, input);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/admin" className="text-tertiary hover:text-on-surface">
                Gobernanza
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">Apelaciones</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">Gobernanza</span>
          <h1 className="flex items-center gap-2 font-headline text-3xl font-black tracking-tighter text-on-surface md:text-4xl">
            <Gavel className="size-7 text-primary" aria-hidden="true" />
            Apelaciones de liderazgo
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-tertiary">
            Solicitudes de los líderes para transferir su liderazgo. La apelación es una solicitud, no una designación.
          </p>
        </div>
        <nav aria-label="Filtrar por estado" className="overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low p-1">
            {FILTROS.map((f) => (
              <li key={f.value}>
                <Link
                  href={hrefFiltro(f.value)}
                  aria-current={f.value === filtro ? 'page' : undefined}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    f.value === filtro ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          {isError ? (
            <Empty tone="danger" role="alert" className="border-0 shadow-none">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{getApiErrorMessage(error, 'admin')}</EmptyTitle>
              </EmptyHeader>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} className="text-xs font-semibold">
                Reintentar
              </Button>
            </Empty>
          ) : isPending ? (
            <div className="space-y-2 p-4" aria-label="Cargando apelaciones">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty tone="muted" role="status" className="border-0 shadow-none">
              <EmptyMedia variant="icon">
                <Gavel aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{filtro === 'PENDIENTE' ? 'No hay apelaciones pendientes.' : 'No hay apelaciones con este estado.'}</EmptyTitle>
                <EmptyDescription>Cuando un líder apele su liderazgo, aparecerá aquí.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Proyecto</TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Líder solicitante</TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Candidato propuesto</TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Asunto</TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Fecha</TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Estado</TableHead>
                    <TableHead className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-tertiary">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((a) => {
                    const badge = ESTADO_BADGE[a.estadoApelacion] ?? { label: a.estadoApelacion, className: 'bg-surface-container-high text-on-surface-variant' };
                    const activa = a.idApelacion === seleccionadaId;
                    return (
                      <TableRow key={a.idApelacion} className={`border-outline-variant/40 ${activa ? 'bg-primary/5' : 'hover:bg-surface-container-low'}`}>
                        <TableCell className="px-4 py-3">
                          <Link href={`/dashboard/admin/proyectos/${a.idProyecto}`} className="text-sm font-semibold text-primary hover:underline">
                            Proyecto #{a.idProyecto}
                          </Link>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-on-surface">
                          <span className="inline-flex items-center gap-2">
                            <Avatar className="size-7">
                              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                {getInitials(a.liderSolicitante.nombre, a.liderSolicitante.apellido)}
                              </AvatarFallback>
                            </Avatar>
                            {a.liderSolicitante.nombre} {a.liderSolicitante.apellido}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-on-surface">
                          {a.candidatoPropuesto.nombre} {a.candidatoPropuesto.apellido}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate px-4 py-3 text-sm text-on-surface-variant" title={a.asunto}>
                          {a.asunto}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-sm text-on-surface-variant">{formatearFecha(a.creadaEn)}</TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge className={`border-transparent text-[11px] font-semibold ${badge.className}`}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={activa}
                            aria-label={`Revisar apelación #${a.idApelacion}`}
                            onClick={() => setSeleccionadaId(activa ? null : a.idApelacion)}
                            className="h-8 gap-1 text-xs font-bold text-primary hover:text-primary"
                          >
                            {activa ? 'Ocultar' : 'Revisar'}
                            <ChevronRight className={`size-3.5 transition-transform ${activa ? 'rotate-90' : ''}`} aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!isPending && !isError && total > 0 && (
            <div className="flex flex-col gap-2 border-t border-outline-variant/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-tertiary">
                <span className="font-bold text-on-surface">{total}</span> {total === 1 ? 'apelación' : 'apelaciones'} · página {page} de {totalPages}
              </p>
              <nav aria-label="Paginación" className="flex items-center gap-1">
                <Button asChild variant="outline" size="icon-sm" aria-label="Página anterior" className="rounded-lg">
                  {page <= 1 ? (
                    <span aria-disabled="true" className="opacity-40">
                      <ChevronLeft className="size-4" />
                    </span>
                  ) : (
                    <Link href={hrefFiltro(filtro, page - 1)}>
                      <ChevronLeft className="size-4" />
                    </Link>
                  )}
                </Button>
                <Button asChild variant="outline" size="icon-sm" aria-label="Página siguiente" className="rounded-lg">
                  {page >= totalPages ? (
                    <span aria-disabled="true" className="opacity-40">
                      <ChevronRight className="size-4" />
                    </span>
                  ) : (
                    <Link href={hrefFiltro(filtro, page + 1)}>
                      <ChevronRight className="size-4" />
                    </Link>
                  )}
                </Button>
              </nav>
            </div>
          )}
        </div>

        <div>
          {seleccionada ? (
            <AppealPanel apelacion={seleccionada} onAceptar={() => setAceptando(seleccionada)} onDenegar={() => setDenegando(seleccionada)} />
          ) : (
            <div className={`${CARD} text-sm text-tertiary`}>Selecciona una apelación para ver el mensaje completo y resolverla.</div>
          )}
        </div>
      </div>

      {aceptando && (
        <LeadershipChangeDialog
          projectId={aceptando.idProyecto}
          open
          onOpenChange={(open) => {
            if (!open) setAceptando(null);
          }}
          presetCandidateId={aceptando.candidatoPropuesto.idUsuario}
          submit={submitAceptar(aceptando)}
          title="Aceptar apelación y transferir liderazgo"
          confirmLabel="Aceptar y transferir"
          onTransferred={() => setSeleccionadaId(null)}
        />
      )}

      <DenyDialog
        apelacion={denegando}
        open={denegando != null}
        onOpenChange={(open) => {
          if (!open) setDenegando(null);
        }}
      />
    </div>
  );
}
