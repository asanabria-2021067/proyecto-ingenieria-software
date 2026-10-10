'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Check, ChevronRight, Gavel, Loader2, SearchX, X } from 'lucide-react';
import { useAdminAppeals, useDenyAppeal, useLeadershipCandidates } from '@/hooks/use-leadership';
import { acceptAppeal } from '@/lib/services/leadership';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { LeadershipChangeDialog } from '@/components/leadership/leadership-change-dialog';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { REQUEST_INBOX_BUTTON, REQUEST_INBOX_BUTTON_GREEN } from '@/components/admin/request-inbox-details';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
  DataTablePager,
} from '@/components/dashboard/data-table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import uvgSwal from '@/lib/swal';
import {
  MENSAJE_RESOLUCION_MAX,
  motivoInelegibilidadLabel,
  type ApelacionItemDto,
  type TransferLeadershipInput,
} from '@/lib/types/leadership';

const FILTROS = [
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'ACEPTADA', label: 'Aceptadas' },
  { value: 'DENEGADA', label: 'Denegadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
] as const;
type Filtro = (typeof FILTROS)[number]['value'];

/** Etiqueta de estado de apelación: tono `pill-*` (app/global.css); la forma la pone `.pill`. */
export const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'pill-amber' },
  ACEPTADA: { label: 'Aceptada', className: 'pill-success' },
  DENEGADA: { label: 'Denegada', className: 'pill-red' },
  CANCELADA: { label: 'Cancelada', className: 'pill-neutral' },
};

// Mismas clases de tabla que las bandejas de Proyectos (closed-projects-board).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-middle';
// Columnas que solo caben desde cierto ancho de la tarjeta; antes van como metadata bajo el asunto.
const COL_PERSONAS = '@2xl/bandeja:table-cell';
const META_PERSONAS = '@2xl/bandeja:hidden';
const COL_ESTADO = '@xl/bandeja:table-cell';
const META_ESTADO = '@xl/bandeja:hidden';
// Tarjeta compacta del detalle expandido (líder, candidato, mensaje, resolución).
const DETALLE_CARD = 'rounded-control border border-outline-variant/40 bg-surface-container-lowest p-inline';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function nombreCompleto(u: { nombre: string; apellido: string }): string {
  return `${u.nombre} ${u.apellido}`.trim();
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

/** Búsqueda local sobre la página cargada: proyecto, asunto, líder o candidato. */
function coincide(a: ApelacionItemDto, texto: string): boolean {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  return [
    `#${a.idProyecto}`,
    `proyecto #${a.idProyecto}`,
    `#${a.idApelacion}`,
    a.asunto,
    nombreCompleto(a.liderSolicitante),
    nombreCompleto(a.candidatoPropuesto),
  ].some((v) => v.toLowerCase().includes(q));
}

function PersonaAvatar({ persona }: { persona: { nombre: string; apellido: string } }) {
  return (
    <Avatar className="size-7 shrink-0">
      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
        {getInitials(persona.nombre, persona.apellido)}
      </AvatarFallback>
    </Avatar>
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const badge = ESTADO_BADGE[estado] ?? { label: estado, className: 'pill-neutral' };
  return <span className={`pill pill-sm ${badge.className}`}>{badge.label}</span>;
}

// ─── Detalle expandido bajo la fila ──────────────────────────────────────────
function AppealDetail({
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

  return (
    <section aria-label={`Apelación #${apelacion.idApelacion}`} className="flex flex-col gap-inline px-stack py-stack">
      <div className="grid grid-cols-1 gap-inline @xl/bandeja:grid-cols-2">
        <div className={`${DETALLE_CARD} flex min-w-0 items-center gap-tight`}>
          <PersonaAvatar persona={apelacion.liderSolicitante} />
          <div className="min-w-0">
            <p className="type-meta">Líder solicitante</p>
            <p className="type-body truncate font-semibold text-text-primary">{nombreCompleto(apelacion.liderSolicitante)}</p>
          </div>
        </div>
        <div className={`${DETALLE_CARD} flex min-w-0 items-start gap-tight`}>
          <PersonaAvatar persona={apelacion.candidatoPropuesto} />
          <div className="min-w-0 flex-1">
            <p className="type-meta">Candidato propuesto</p>
            <p className="type-body truncate font-semibold text-text-primary">{nombreCompleto(apelacion.candidatoPropuesto)}</p>
            {pendiente && candidato && (
              <p className="type-meta mt-micro break-words">
                {candidato.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol'} · {candidato.tareasDistintas}{' '}
                {candidato.tareasDistintas === 1 ? 'tarea' : 'tareas'} · {formatearDecimal(candidato.horasReportadas)} h reportadas
                {!candidato.seleccionable && (
                  <span className="block text-error">
                    No elegible: {candidato.motivos.map(motivoInelegibilidadLabel).join('; ') || 'sin motivo'}
                  </span>
                )}
              </p>
            )}
            {pendiente && <p className="type-meta mt-micro break-words">Es una propuesta: al aceptar puedes elegir otro candidato elegible.</p>}
          </div>
        </div>
      </div>

      <div className={DETALLE_CARD}>
        <p className="type-meta">Mensaje</p>
        <p className="type-body mt-micro whitespace-pre-wrap break-words text-text-primary">{apelacion.mensaje}</p>
      </div>

      {!pendiente && (
        <div className={DETALLE_CARD}>
          <p className="type-meta">Resolución</p>
          <p className="type-body mt-micro text-text-primary">
            {apelacion.adminResolutor ? nombreCompleto(apelacion.adminResolutor) : 'Sin resolutor'} · {formatearFecha(apelacion.resueltaEn)}
          </p>
          {apelacion.mensajeResolucion && (
            <p className="type-body mt-micro whitespace-pre-wrap text-text-secondary">{apelacion.mensajeResolucion}</p>
          )}
        </div>
      )}

      {pendiente && (
        <div className="flex flex-col gap-tight sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDenegar}
            className={`${REQUEST_INBOX_BUTTON} border-error/40 text-error hover:bg-error/10 hover:text-error`}
          >
            <X aria-hidden="true" />
            Denegar
          </Button>
          <Button type="button" size="sm" onClick={onAceptar} className={`${REQUEST_INBOX_BUTTON} ${REQUEST_INBOX_BUTTON_GREEN}`}>
            <Check aria-hidden="true" />
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
function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando apelaciones">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-32 rounded-tag" />
            </div>
            <Skeleton className="hidden h-4 w-32 @2xl/bandeja:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * VIEW-18 (F015) — bandeja administrativa de apelaciones de liderazgo. Solo
 * las PENDIENTES son resolubles: Aceptar reutiliza `LeadershipChangeDialog`
 * (mismo CAS `expectedLeaderId`, candidato precargado y editable) por el
 * endpoint de aceptación; Denegar exige `mensajeResolucion`.
 *
 * Misma tabla, buscador y paginador que las bandejas de Proyectos. La
 * apelación seleccionada se despliega bajo su propia fila, no en una tarjeta
 * aparte. La búsqueda es local a la página cargada (el endpoint pagina por
 * estado); la paginación sigue en la URL (`?page=`).
 */
export default function AppealsInboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtro = parseFiltro(searchParams.get('estado'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const estado = filtro === 'TODAS' ? undefined : filtro;

  const { data, isPending, isError, error, refetch } = useAdminAppeals(estado, page);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [aceptando, setAceptando] = useState<ApelacionItemDto | null>(null);
  const [denegando, setDenegando] = useState<ApelacionItemDto | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const visibles = useMemo(() => items.filter((a) => coincide(a, busqueda)), [items, busqueda]);
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hayBusqueda = busqueda.trim() !== '';

  const submitAceptar = (apelacion: ApelacionItemDto) => (input: TransferLeadershipInput) =>
    acceptAppeal(apelacion.idProyecto, apelacion.idApelacion, input);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb seccion="Gobernanza" seccionHref="/dashboard/admin" pagina="Apelaciones" />

      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="type-display text-balance">Apelaciones de liderazgo</h1>
          <p className="mt-tight max-w-2xl text-base text-tertiary">
            Solicitudes de los líderes para transferir su liderazgo. La apelación es una solicitud, no una designación.
          </p>
        </div>
        <nav aria-label="Filtrar por estado" className="overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1 rounded-control border border-outline-variant/40 bg-surface-container-low p-1">
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

      <div className="@container/bandeja flex flex-col gap-stack">
        <section aria-label="Buscar apelaciones" className="flex flex-col gap-inline @xl/bandeja:flex-row @xl/bandeja:items-center @xl/bandeja:justify-between">
          <DashboardSearchField
            containerClassName="w-full @xl/bandeja:max-w-sm"
            name="busqueda"
            autoComplete="off"
            spellCheck={false}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proyecto, asunto, líder o candidato…"
            aria-label="Buscar apelaciones por proyecto, asunto, líder o candidato"
          />
          {!isPending && !isError && (
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Total de apelaciones:{' '}
              {hayBusqueda && (
                <>
                  <span className="font-semibold tabular-nums text-text-primary">{visibles.length}</span> de{' '}
                </>
              )}
              <span className="font-semibold tabular-nums text-text-primary">{total}</span>
              {totalPages > 1 && <> · página {page} de {totalPages}</>}
            </p>
          )}
        </section>

        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{getApiErrorMessage(error, 'admin')}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isPending ? (
          <TablaSkeleton />
        ) : items.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <Gavel aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{filtro === 'PENDIENTE' ? 'No hay apelaciones pendientes.' : 'No hay apelaciones con este estado.'}</EmptyTitle>
              <EmptyDescription>Cuando un líder apele su liderazgo, aparecerá aquí.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visibles.length === 0 ? (
          <Empty role="status">
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No encontramos apelaciones que coincidan con “{busqueda.trim()}”.</EmptyTitle>
              <EmptyDescription>Prueba con otro texto o cambia de página.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => setBusqueda('')}>
                Limpiar búsqueda
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className={DATA_TABLE_CARD}>
              <Table>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>
                      Apelación
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden w-[18%] ${COL_PERSONAS}`}>
                      Líder solicitante
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden w-[18%] ${COL_PERSONAS}`}>
                      Candidato propuesto
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden w-28 ${COL_ESTADO}`}>
                      Estado
                    </TableHead>
                    <TableHead scope="col" className={`${TH} w-14 text-right @2xl/bandeja:w-32`}>
                      <span className="sr-only">Acción</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((a) => {
                    const activa = a.idApelacion === seleccionadaId;
                    const detalleId = `apelacion-${a.idApelacion}-detalle`;
                    return (
                      <AppealRows
                        key={a.idApelacion}
                        apelacion={a}
                        activa={activa}
                        detalleId={detalleId}
                        onToggle={() => setSeleccionadaId(activa ? null : a.idApelacion)}
                        onAceptar={() => setAceptando(a)}
                        onDenegar={() => setDenegando(a)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <DataTablePager
                label="Paginación de apelaciones"
                pagina={page}
                totalPaginas={totalPages}
                onPagina={(p) => router.push(hrefFiltro(filtro, p))}
              />
            )}
          </>
        )}
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

/** Fila de la tabla y, si está seleccionada, la fila de detalle justo debajo. */
function AppealRows({
  apelacion: a,
  activa,
  detalleId,
  onToggle,
  onAceptar,
  onDenegar,
}: {
  apelacion: ApelacionItemDto;
  activa: boolean;
  detalleId: string;
  onToggle: () => void;
  onAceptar: () => void;
  onDenegar: () => void;
}) {
  return (
    <>
      <TableRow className={`${DATA_TABLE_ROW_BORDER} ${activa ? 'bg-surface-container-low' : DATA_TABLE_ROW_HOVER}`}>
        <TableCell className={`${TD} min-w-0`}>
          <p className="type-body break-words font-semibold text-text-primary">{a.asunto}</p>
          <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
            <span className={META_ESTADO}>
              <EstadoPill estado={a.estadoApelacion} />
            </span>
            <span className="type-meta">
              <Link href={`/dashboard/admin/proyectos/${a.idProyecto}`} className="font-semibold text-primary hover:underline">
                Proyecto #{a.idProyecto}
              </Link>{' '}
              · {formatearFecha(a.creadaEn)}
            </span>
            <span className={`type-meta ${META_PERSONAS}`}>
              · {nombreCompleto(a.liderSolicitante)} → {nombreCompleto(a.candidatoPropuesto)}
            </span>
          </div>
        </TableCell>
        <TableCell className={`${TD} hidden ${COL_PERSONAS}`}>
          <span className="inline-flex min-w-0 items-center gap-tight">
            <PersonaAvatar persona={a.liderSolicitante} />
            <span className="type-body truncate text-text-primary">{nombreCompleto(a.liderSolicitante)}</span>
          </span>
        </TableCell>
        <TableCell className={`${TD} hidden ${COL_PERSONAS}`}>
          <span className="inline-flex min-w-0 items-center gap-tight">
            <PersonaAvatar persona={a.candidatoPropuesto} />
            <span className="type-body truncate text-text-primary">{nombreCompleto(a.candidatoPropuesto)}</span>
          </span>
        </TableCell>
        <TableCell className={`${TD} hidden ${COL_ESTADO}`}>
          <EstadoPill estado={a.estadoApelacion} />
        </TableCell>
        <TableCell className="whitespace-normal px-micro py-inline text-right align-middle @2xl/bandeja:px-stack">
          <button
            type="button"
            aria-expanded={activa}
            aria-controls={detalleId}
            aria-label={`Revisar apelación #${a.idApelacion}`}
            onClick={onToggle}
            className="ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary hover:underline"
          >
            <span className="hidden @2xl/bandeja:inline">{activa ? 'Ocultar' : 'Revisar'}</span>
            <ChevronRight className={`size-4 transition-transform @2xl/bandeja:size-3.5 ${activa ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
        </TableCell>
      </TableRow>
      {activa && (
        <TableRow id={detalleId} className={`${DATA_TABLE_ROW_BORDER} bg-surface-container-low hover:bg-surface-container-low`}>
          <TableCell colSpan={5} className="whitespace-normal p-0">
            <AppealDetail apelacion={a} onAceptar={onAceptar} onDenegar={onDenegar} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
