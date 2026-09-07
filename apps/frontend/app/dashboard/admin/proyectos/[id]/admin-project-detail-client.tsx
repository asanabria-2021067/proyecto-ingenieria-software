'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ClipboardCheck, Crown, FileText, Layers, UserCog, Users } from 'lucide-react';
import { useAdminProjectDetail } from '@/hooks/use-admin-projects';
import { useLeadershipHistory } from '@/hooks/use-leadership';
import { isHistoricalDetail } from '@/lib/services/admin-projects';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle, tipoBadgeLabel, tipoBadgeStyle } from '@/components/projects/available-project-card';
import { ClosureStatusBanner } from '@/components/projects/closure-status-banner';
import { LeadershipCard } from '@/components/leadership/leadership-card';
import { LeadershipChangeDialog } from '@/components/leadership/leadership-change-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { HistoricalProjectView } from '@/lib/services/historical';
import {
  ADMIN_PROJECT_GROUP_LABEL,
  adminProjectsGroupHref,
  isAdminProjectGroup,
  type AdminProjectDetail,
  type AdminProjectGroup,
} from '@/lib/types/admin-projects';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

const TAB_TRIGGER =
  'rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[13px] font-bold data-[state=active]:border-primary data-[state=active]:shadow-none';

const ESTADO_PARTICIPACION_LABEL: Record<string, string> = {
  ACTIVO: 'Activa',
  RETIRADO: 'Retirada',
  COMPLETADO: 'Completada',
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Grupo de la bandeja al que pertenece un estado (para el breadcrumb/retorno). */
export function grupoDeEstado(estadoProyecto: string): AdminProjectGroup {
  switch (estadoProyecto) {
    case 'EN_SOLICITUD_CIERRE':
      return 'cierres';
    case 'CERRADO':
      return 'cerrados';
    default:
      return 'activos';
  }
}

/** Forma común para renderizar: unifica el detalle vivo y el histórico. */
interface VistaAdmin {
  idProyecto: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  lider: { idUsuario: number; nombre: string; apellido: string };
  miembros: Array<{
    key: number;
    usuario: { idUsuario: number; nombre: string; apellido: string };
    rol: string;
    participacion: string;
    tareas: number | null;
    horas: string | null;
  }>;
  sprints: Array<{ idSprint: number; numero: number; estado: string; fechaInicio?: string | null; fechaCierre?: string | null }>;
  historico: HistoricalProjectView | null;
}

function toVista(detail: AdminProjectDetail | HistoricalProjectView): VistaAdmin {
  if (isHistoricalDetail(detail)) {
    const horasPorUsuario = new Map(detail.totales.porUsuario.map((u) => [u.idUsuario, u]));
    return {
      idProyecto: detail.projectId,
      titulo: detail.resumen.tituloProyecto,
      descripcion: detail.resumen.descripcionProyecto,
      tipo: detail.resumen.tipoProyecto,
      estado: detail.resumen.estadoProyecto,
      lider: detail.liderazgo.liderActual,
      miembros: detail.miembrosHistoricos.map((m) => ({
        key: m.idParticipacion,
        usuario: m.usuario,
        rol: m.rol.nombreRol,
        participacion: m.estadoParticipacion,
        tareas: horasPorUsuario.get(m.usuario.idUsuario)?.tareasDistintas ?? null,
        horas: horasPorUsuario.get(m.usuario.idUsuario)?.acreditadas ?? null,
      })),
      sprints: detail.sprintsCerrados.map((s) => ({ ...s, estado: 'CERRADO' })),
      historico: detail,
    };
  }
  return {
    idProyecto: detail.projectId,
    titulo: detail.resumen.tituloProyecto,
    descripcion: detail.resumen.descripcionProyecto,
    tipo: detail.resumen.tipoProyecto,
    estado: detail.resumen.estadoProyecto,
    lider: detail.liderazgo.liderActual,
    miembros: detail.miembros.map((m) => ({
      key: m.idParticipacion,
      usuario: m.usuario,
      rol: m.rolProyecto.nombreRol,
      participacion: m.estadoParticipacion,
      tareas: null,
      horas: null,
    })),
    sprints: detail.sprints,
    historico: null,
  };
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-44 w-full rounded-xl" />
      <Skeleton className="mb-4 h-10 w-96" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export interface AdminProjectDetailClientProps {
  id: number;
}

/** Solo se transfiere el liderazgo con el proyecto operativo (06 v2 §18). */
export function puedeTransferirLiderazgo(estadoProyecto: string): boolean {
  return estadoProyecto === 'PUBLICADO' || estadoProyecto === 'EN_PROGRESO';
}

/**
 * VIEW-16 (F013) — detalle administrativo de SOLO LECTURA. `permisos` llega
 * siempre en `false`; en proyecto vivo solo se ven Sprints CERRADOS (el
 * filtro es del backend) y en `CERRADO` se muestra el histórico completo.
 * No hay botones inertes: la única acción (cambiar liderazgo) la añade F014.
 */
export default function AdminProjectDetailClient({ id }: AdminProjectDetailClientProps) {
  const searchParams = useSearchParams();
  const grupoParam = searchParams.get('grupo');
  const { data, isPending, isError, error, refetch } = useAdminProjectDetail(id);
  const historial = useLeadershipHistory(id, 1, Boolean(data));
  // F014 (VIEW-19): UN solo botón general «Cambiar liderazgo» (nunca uno por
  // integrante); su autoridad es el endpoint admin, no esta pantalla.
  const [cambioAbierto, setCambioAbierto] = useState(false);

  if (isPending) return <DetailSkeleton />;

  if (isError || !data) {
    const status = getApiErrorStatus(error);
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
        <Empty tone={status === 404 ? 'muted' : 'danger'} role={status === 404 ? 'status' : 'alert'}>
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{status === 404 ? 'El proyecto ya no existe.' : getApiErrorMessage(error, 'admin')}</EmptyTitle>
            <EmptyDescription>Vuelve a la bandeja para continuar.</EmptyDescription>
          </EmptyHeader>
          <div className="flex gap-2">
            {status !== 404 && status !== 403 && (
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={adminProjectsGroupHref('activos')}>Volver a la bandeja</Link>
            </Button>
          </div>
        </Empty>
      </div>
    );
  }

  const vista = toVista(data);
  const grupo: AdminProjectGroup = isAdminProjectGroup(grupoParam) ? grupoParam : grupoDeEstado(vista.estado);
  const integrantesActivos = new Set(vista.miembros.filter((m) => m.participacion === 'ACTIVO').map((m) => m.usuario.idUsuario)).size;
  const sprintsCerrados = vista.sprints.filter((s) => s.estado === 'CERRADO');
  const revisionAprobada = vista.historico ? [...vista.historico.revisiones].reverse().find((r) => r.estadoRevision === 'APROBADA') ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={adminProjectsGroupHref(grupo)} className="text-tertiary hover:text-on-surface">
                Proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={adminProjectsGroupHref(grupo)} className="text-tertiary hover:text-on-surface">
                {ADMIN_PROJECT_GROUP_LABEL[grupo]}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-xs truncate font-medium text-on-surface">{vista.titulo}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ClosureStatusBanner
        idProyecto={vista.idProyecto}
        estadoProyecto={vista.estado}
        fechaCierre={revisionAprobada?.resueltaEn ?? null}
        className="mb-4"
      />

      {/* Cabecera */}
      <div className={`${CARD} mb-4`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeStyle(vista.estado)}`}>
                {estadoBadgeLabel(vista.estado)}
              </span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoBadgeStyle(vista.tipo)}`}>
                {tipoBadgeLabel(vista.tipo)}
              </span>
            </div>
            <h1 className="font-headline text-2xl font-black leading-tight text-on-surface md:text-[28px]">{vista.titulo}</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-on-surface-variant">
              {vista.descripcion || 'Sin descripción disponible.'}
            </p>
          </div>
          {puedeTransferirLiderazgo(vista.estado) && (
            <div className="shrink-0">
              <Button
                type="button"
                onClick={() => setCambioAbierto(true)}
                className="h-10 w-full gap-1.5 rounded-lg text-sm font-bold sm:w-auto"
              >
                <UserCog className="size-4" aria-hidden="true" />
                Cambiar liderazgo
              </Button>
            </div>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-outline-variant/40 pt-4 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {getInitials(vista.lider.nombre, vista.lider.apellido)}
              </AvatarFallback>
            </Avatar>
            <div>
              <dt className="text-[11px] text-tertiary">Líder del proyecto</dt>
              <dd className="font-semibold text-on-surface">
                {vista.lider.nombre} {vista.lider.apellido}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Users className="size-5" />
            </span>
            <div>
              <dt className="text-[11px] text-tertiary">Equipo de trabajo</dt>
              <dd className="font-semibold text-on-surface">
                {integrantesActivos} {integrantesActivos === 1 ? 'integrante' : 'integrantes'}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Layers className="size-5" />
            </span>
            <div>
              <dt className="text-[11px] text-tertiary">Sprints</dt>
              <dd className="font-semibold text-on-surface">
                {sprintsCerrados.length} {sprintsCerrados.length === 1 ? 'Sprint cerrado' : 'Sprints cerrados'}
                {!vista.historico && <span className="block text-[11px] font-normal text-tertiary">El Sprint operable no es visible para administración.</span>}
              </dd>
            </div>
          </div>
        </dl>
      </div>

      {vista.estado === 'EN_SOLICITUD_CIERRE' && (
        <div className="mb-4">
          <Button asChild size="sm" className="h-9 gap-1.5 rounded-md text-xs font-bold">
            <Link href={`/dashboard/admin/proyectos/${vista.idProyecto}/cierre`}>
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Revisar solicitud de cierre
            </Link>
          </Button>
        </div>
      )}

      {puedeTransferirLiderazgo(vista.estado) && (
        <LeadershipChangeDialog
          projectId={vista.idProyecto}
          open={cambioAbierto}
          onOpenChange={setCambioAbierto}
          liderDesde={historial.data?.items.at(-1)?.registradoEn ?? null}
        />
      )}

      <Tabs defaultValue="resumen">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-outline-variant/50 bg-transparent p-0">
          <TabsTrigger value="resumen" className={TAB_TRIGGER}>
            <FileText className="mr-1.5 size-4" aria-hidden="true" />
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
          <TabsTrigger value="liderazgo" className={TAB_TRIGGER}>
            <Crown className="mr-1.5 size-4" aria-hidden="true" />
            Liderazgo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <div className={CARD}>
            <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">Resumen</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
              {vista.descripcion || 'Sin descripción disponible.'}
            </p>
            {vista.historico && (
              <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-outline-variant/40 pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-tertiary">Horas acreditadas</dt>
                  <dd className="font-semibold text-on-surface">{formatearDecimal(vista.historico.totales.acreditadas)} h</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-tertiary">Tareas distintas</dt>
                  <dd className="font-semibold text-on-surface">{vista.historico.totales.tareasDistintas}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-tertiary">Revisiones de cierre</dt>
                  <dd className="font-semibold text-on-surface">{vista.historico.revisiones.length}</dd>
                </div>
              </dl>
            )}
          </div>
        </TabsContent>

        <TabsContent value="miembros" className="mt-4">
          <div className={`${CARD} p-0`}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-bold text-on-surface">
                {integrantesActivos} {integrantesActivos === 1 ? 'integrante activo' : 'integrantes activos'}
              </h2>
            </div>
            {vista.miembros.length === 0 ? (
              <p className="border-t border-outline-variant/40 px-5 py-6 text-sm italic text-tertiary">Sin integrantes registrados.</p>
            ) : (
              <div className="overflow-x-auto border-t border-outline-variant/40">
                <Table>
                  <TableHeader>
                    <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Integrante</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Roles</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Participación</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Tareas</TableHead>
                      <TableHead className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Horas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vista.miembros.map((m) => (
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
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block size-2 rounded-full ${m.participacion === 'ACTIVO' ? 'bg-primary' : 'bg-outline-variant'}`} aria-hidden="true" />
                            {ESTADO_PARTICIPACION_LABEL[m.participacion] ?? m.participacion}
                          </span>
                        </TableCell>
                        <TableCell className="px-5 py-3 text-sm text-on-surface">{m.tareas ?? '—'}</TableCell>
                        <TableCell className="px-5 py-3 text-sm text-on-surface">{m.horas != null ? `${formatearDecimal(m.horas)} h` : '—'}</TableCell>
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
            <h2 className="mb-1 text-base font-bold text-on-surface">
              {vista.historico ? 'Sprints cerrados del histórico' : 'Sprints cerrados'}
            </h2>
            <p className="mb-4 text-xs text-tertiary">
              {vista.historico
                ? 'Histórico completo del proyecto cerrado.'
                : 'En un proyecto vivo solo se consultan los Sprints cerrados; el Sprint en ejecución pertenece al equipo.'}
            </p>
            {sprintsCerrados.length === 0 ? (
              <p className="text-sm italic text-tertiary">Aún no hay Sprints cerrados.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/30" aria-label="Sprints cerrados">
                {sprintsCerrados.map((s) => (
                  <li key={s.idSprint} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="font-medium text-on-surface">Sprint {s.numero}</span>
                    {(s.fechaInicio || s.fechaCierre) && (
                      <span className="text-on-surface-variant">
                        {formatearFecha(s.fechaInicio)}{s.fechaCierre ? ` – ${formatearFecha(s.fechaCierre)}` : ''}
                      </span>
                    )}
                    <Badge variant="outline" className="ml-auto text-[10px] text-tertiary">
                      Cerrado
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="liderazgo" className="mt-4">
          <LeadershipCard
            context={{
              projectId: vista.idProyecto,
              estadoProyecto: vista.estado,
              liderActual: vista.lider,
              tieneParticipacionActiva: false,
              participacionesActivas: [],
              conservaMembresiaSiSeTransfiere: false,
              advertenciaApelacion: null,
              advertenciaAdmin: null,
            }}
            history={historial.data?.items}
            isLoading={historial.isPending}
            readOnly
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
