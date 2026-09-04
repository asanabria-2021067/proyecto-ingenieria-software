'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  History,
  ListChecks,
  MessageCircle,
  Users,
} from 'lucide-react';
import { useSprintDetail } from '@/hooks/use-project-sprints';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ESTADO_COLUMNA_STYLE,
  ESTADO_LABEL,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  getProgressVisualState,
} from '@/components/projects/task-board.utils';
import type {
  EstadoHito,
  EstadoSprint,
  SprintDetailTareaDto,
  SprintHistoryUsuarioDto,
} from '@/lib/types/sprints';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** Formatea un instante ISO completo — mismo patrón que
 * `formatearFechaHora` en `equipo/[idUsuario]/page.tsx` (a diferencia de
 * `formatearFechaLimite`, que espera solo YYYY-MM-DD sin componente de hora,
 * incompatible con `fechaInicio`/`fechaFinalizacionIniciada`/`fechaCierre`,
 * que sí llevan hora). */
function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

/**
 * Estilos de estado de Sprint centralizados (mismo criterio que
 * `ESTADO_PARTICIPACION_STYLE`): un `span` con mapa de clases, no
 * `ui/badge`. Exhaustivo por diseño — un `EstadoSprint` nuevo rompe la
 * compilación en vez de caer silenciosamente en un estado incorrecto.
 */
const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'Activo', className: 'bg-primary-container text-on-primary-container' },
  EN_FINALIZACION: {
    label: 'En finalización',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  CERRADO: { label: 'Cerrado', className: 'bg-surface-container-high text-tertiary' },
};

const ESTADO_HITO_STYLE: Record<EstadoHito, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-surface-container-high text-tertiary' },
  EN_PROGRESO: {
    label: 'En progreso',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  COMPLETADO: { label: 'Completado', className: 'bg-primary-container text-on-primary-container' },
};

interface ParticipanteContribucion {
  usuario: SprintHistoryUsuarioDto;
  idsTareas: Set<number>;
  horasRegistradas: number;
}

/**
 * Agrupa las asignaciones ya incluidas en `detail.tareas` por usuario — no
 * dispara ninguna consulta adicional, solo reorganiza datos que el backend
 * ya entregó en la misma respuesta (mismo criterio que
 * `agruparPorEstado`/`sumaHorasReales` en `equipo/[idUsuario]/page.tsx`).
 * `SprintDetail` no expone roles ni horas reconocidas/aprobadas por
 * participante (eso vive en `SprintClosingSummaryDto`, un endpoint distinto
 * de A8/F5): por eso esta vista solo muestra identidad, cantidad de tareas
 * asignadas y horas registradas (`horasReales`), nunca esos dos campos.
 */
function agruparParticipantes(tareas: SprintDetailTareaDto[]): ParticipanteContribucion[] {
  const porUsuario = new Map<number, ParticipanteContribucion>();
  for (const tarea of tareas) {
    for (const asignacion of tarea.asignaciones) {
      const horas = asignacion.horasReales ?? 0;
      const existente = porUsuario.get(asignacion.usuario.idUsuario);
      if (existente) {
        existente.idsTareas.add(tarea.idTarea);
        existente.horasRegistradas += horas;
      } else {
        porUsuario.set(asignacion.usuario.idUsuario, {
          usuario: asignacion.usuario,
          idsTareas: new Set([tarea.idTarea]),
          horasRegistradas: horas,
        });
      }
    }
  }
  return [...porUsuario.values()];
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function SeccionVacia({ icon: Icon, mensaje }: { icon: typeof Users; mensaje: string }) {
  return (
    <Empty tone="muted" role="status" className="py-8">
      <EmptyMedia variant="compact">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle className="text-sm">{mensaje}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function TareaRow({ tarea, tituloHito }: { tarea: SprintDetailTareaDto; tituloHito: string | null }) {
  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
  const estilo = ESTADO_COLUMNA_STYLE[tarea.estadoTarea];
  const horasReales = tarea.asignaciones.reduce((total, a) => total + (a.horasReales ?? 0), 0);
  const tieneHorasReales = tarea.asignaciones.some((a) => a.horasReales !== null);

  return (
    <TableRow className="border-outline-variant/40 align-top">
      <TableCell className="whitespace-normal px-4 py-3">
        <p className="text-sm font-semibold text-on-surface">{tarea.tituloTarea}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary">
          <span className={`inline-flex items-center gap-1 font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
            <PrioridadIcon className="size-3" aria-hidden="true" />
            {PRIORIDAD_LABEL[tarea.prioridad]}
          </span>
          {tarea.comentarios.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3" aria-hidden="true" />
              {tarea.comentarios.length}{' '}
              {tarea.comentarios.length === 1 ? 'comentario' : 'comentarios'}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
          <span className={`inline-block size-2 rounded-full ${estilo.dot}`} aria-hidden="true" />
          {ESTADO_LABEL[tarea.estadoTarea]}
        </span>
      </TableCell>
      <TableCell className="whitespace-normal px-4 py-3 text-sm text-on-surface-variant">
        {tituloHito ?? 'Sin hito'}
      </TableCell>
      <TableCell className="whitespace-normal px-4 py-3">
        {tarea.asignaciones.length === 0 ? (
          <span className="text-sm text-tertiary">Sin asignaciones</span>
        ) : (
          <ul className="space-y-1">
            {tarea.asignaciones.map((asignacion) => (
              <li key={asignacion.idAsignacion} className="text-xs text-on-surface-variant">
                <span className="font-medium text-on-surface">
                  {asignacion.usuario.nombre} {asignacion.usuario.apellido}
                </span>{' '}
                · {formatearFechaHora(asignacion.fechaAsignacion)}
                {asignacion.desasignadaEn && ` → ${formatearFechaHora(asignacion.desasignadaEn)}`}
              </li>
            ))}
          </ul>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-3 text-right text-sm">
        <p className="font-bold text-on-surface">
          {tieneHorasReales ? `${formatearHoras(horasReales)} h` : '— h'}
        </p>
        <p className="text-xs text-tertiary">
          Estimado:{' '}
          {tarea.tiempoEstimadoHoras !== null ? `${formatearHoras(tarea.tiempoEstimadoHoras)} h` : '—'}
        </p>
      </TableCell>
    </TableRow>
  );
}

function ParticipanteRow({ participante }: { participante: ParticipanteContribucion }) {
  const { usuario } = participante;
  return (
    <TableRow className="border-outline-variant/40">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary-container text-xs font-bold text-on-primary-container">
              {getInitials(usuario.nombre, usuario.apellido)}
            </AvatarFallback>
          </Avatar>
          <span className="whitespace-nowrap text-sm font-medium text-on-surface">
            {usuario.nombre} {usuario.apellido}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-on-surface">{participante.idsTareas.size}</TableCell>
      <TableCell className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">
        {formatearHoras(participante.horasRegistradas)} h
      </TableCell>
    </TableRow>
  );
}

function HitoRow({ hito }: { hito: { idHito: number; tituloHito: string; estadoHito: EstadoHito; porcentaje: number } }) {
  const estilo = ESTADO_HITO_STYLE[hito.estadoHito];
  const visual = getProgressVisualState(hito.porcentaje);
  return (
    <div
      key={hito.idHito}
      className="flex flex-col gap-2 border-b border-outline-variant/40 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Flag className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-medium text-on-surface">{hito.tituloHito}</span>
      </div>
      <span
        className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
      >
        {estilo.label}
      </span>
      <div className="flex min-w-[140px] items-center gap-2 sm:w-40">
        <div
          role="progressbar"
          aria-valuenow={hito.porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso de ${hito.tituloHito}`}
          className={`h-1.5 flex-1 overflow-hidden rounded-full ${visual.track}`}
        >
          <div
            className={`h-full rounded-full ${visual.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, hito.porcentaje))}%` }}
          />
        </div>
        <span className={`w-10 text-right text-xs font-bold ${visual.text}`}>{hito.porcentaje}%</span>
      </div>
    </div>
  );
}

export default function SprintDetailPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { detail, isLoading, isError, refetch } = useSprintDetail(idProyecto, idSprint);

  // GET /proyectos/:id/sprints/:sprintId es exclusivo del líder en backend
  // (SprintsAuthorizationService.assertCanViewSprintHistory). Mismo criterio
  // de detección client-side que la lista de Sprints y Miembros.
  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const volverHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={volverHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {!cargandoProyecto && !cargandoUsuario && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder al detalle de este Sprint." />
      ) : (
        <>
          {isLoading && <DetailSkeleton />}

          {!isLoading && isError && (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No fue posible cargar el detalle de este Sprint.</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!isLoading && !isError && detail && (
            <SprintDetailContent detail={detail} />
          )}
        </>
      )}
    </div>
  );
}

function SprintDetailContent({
  detail,
}: {
  detail: NonNullable<ReturnType<typeof useSprintDetail>['detail']>;
}) {
  const estiloEstado = ESTADO_SPRINT_STYLE[detail.estado];
  const hitosPorId = new Map(detail.hitos.map((hito) => [hito.idHito, hito.tituloHito]));
  const participantes = agruparParticipantes(detail.tareas);

  return (
    <div className="space-y-6">
      {/* ENCABEZADO */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <History className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-headline text-3xl font-extrabold text-on-surface">Sprint {detail.numero}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estiloEstado.className}`}
            >
              {estiloEstado.label}
            </span>
          </div>
          <Button
            asChild
            variant="outline"
            className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
          >
            <Link href={`/dashboard/proyectos/${detail.idProyecto}/sprints/${detail.idSprint}/analytics`}>
              <BarChart3 className="size-3.5" aria-hidden="true" />
              Ver analítica
            </Link>
          </Button>
        </div>
        <p className="mt-2 text-sm text-tertiary">
          Resumen histórico del trabajo, las contribuciones y los hitos de este Sprint.
        </p>

        {/* METADATA HISTÓRICA — solo campos que el DTO realmente entrega */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-outline-variant/30 pt-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-tertiary">
            <Calendar className="size-4" aria-hidden="true" />
            Fecha de inicio:{' '}
            <span className="font-medium text-on-surface">{formatearFechaHora(detail.fechaInicio)}</span>
          </span>
          {detail.fechaFinalizacionIniciada && (
            <span className="inline-flex items-center gap-1.5 text-tertiary">
              <Clock className="size-4" aria-hidden="true" />
              Finalización iniciada:{' '}
              <span className="font-medium text-on-surface">
                {formatearFechaHora(detail.fechaFinalizacionIniciada)}
              </span>
            </span>
          )}
          {detail.fechaCierre && (
            <span className="inline-flex items-center gap-1.5 text-tertiary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Fecha de cierre:{' '}
              <span className="font-medium text-on-surface">{formatearFechaHora(detail.fechaCierre)}</span>
            </span>
          )}
        </div>
      </div>

      {/* TAREAS DEL SPRINT */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-lg font-bold text-on-surface">Tareas del Sprint</h2>
        </div>
        {detail.tareas.length === 0 ? (
          <SeccionVacia icon={ListChecks} mensaje="Este Sprint no tiene tareas registradas." />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
            <Table>
              <TableHeader>
                <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Tarea
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Estado
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Hito
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Asignaciones
                  </TableHead>
                  <TableHead className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Horas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.tareas.map((tarea) => (
                  <TareaRow
                    key={tarea.idTarea}
                    tarea={tarea}
                    tituloHito={tarea.idHito !== null ? (hitosPorId.get(tarea.idHito) ?? null) : null}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* PARTICIPANTES Y CONTRIBUCIÓN */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-lg font-bold text-on-surface">Participantes y contribución</h2>
        </div>
        {participantes.length === 0 ? (
          <SeccionVacia icon={Users} mensaje="No hay participantes registrados para este Sprint." />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
            <Table>
              <TableHeader>
                <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Integrante
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Tareas
                  </TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                    Horas registradas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participantes.map((participante) => (
                  <ParticipanteRow key={participante.usuario.idUsuario} participante={participante} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* HITOS DEL SPRINT */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-lg font-bold text-on-surface">Hitos del Sprint</h2>
        </div>
        {detail.hitos.length === 0 ? (
          <SeccionVacia icon={Flag} mensaje="Este Sprint no tiene hitos asociados." />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
            {detail.hitos.map((hito) => (
              <HitoRow key={hito.idHito} hito={hito} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
