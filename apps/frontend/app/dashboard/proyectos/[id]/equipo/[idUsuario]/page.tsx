'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectMemberDetail } from '@/hooks/use-project-member-detail';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  ESTADO_COLUMNA_STYLE,
  ESTADO_LABEL,
  formatearFechaLimite,
} from '@/components/projects/task-board.utils';
import type {
  HistorialSprintIntegranteDTO,
  TareaHistorialIntegranteDTO,
} from '@/lib/dto/member-detail.dto';
import { ESTADO_PARTICIPACION_STYLE } from '@/components/projects/member-status.utils';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import type { EstadoSprint } from '@/lib/types/sprints';

/**
 * Estilos de estado de Sprint (mismo criterio `statusConfig` manual que
 * `ESTADO_SPRINT_STYLE` en `sprints/page.tsx` y `sprints/[sprintId]/page.tsx`,
 * F4 — no exportado en ninguna de las dos, así que se repite localmente en
 * vez de importar entre páginas congeladas).
 */
const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'ACTIVO', className: 'bg-primary-container text-on-primary-container' },
  EN_FINALIZACION: {
    label: 'EN FINALIZACIÓN',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  CERRADO: { label: 'CERRADO', className: 'bg-surface-container-high text-tertiary' },
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** Formatea un instante ISO completo (fechaAsignacion/desasignadaEn) — a diferencia de
 * formatearFechaLimite, que espera solo YYYY-MM-DD sin componente de hora. */
function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sumaHorasReales(tareas: TareaHistorialIntegranteDTO[]): number {
  return tareas.reduce((total, tarea) => total + (tarea.horasReales ?? 0), 0);
}

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

/** B14 no garantiza orden descendente (ordena `sprints` ascendente por `numero`); esto es puramente presentacional, nunca reagrupa tareas/horas. */
function ordenarSprintsDescendente(
  sprints: HistorialSprintIntegranteDTO[],
): HistorialSprintIntegranteDTO[] {
  return [...sprints].sort((a, b) => b.numero - a.numero);
}

function DetalleSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export default function DetalleIntegranteProyectoPage() {
  const { id, idUsuario } = useParams<{ id: string; idUsuario: string }>();
  const idProyecto = Number(id);
  const idUsuarioNum = Number(idUsuario);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const cargandoPermisos = cargandoProyecto || cargandoUsuario;
  const isLeader =
    !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;

  const {
    data: detalle,
    isLoading: cargandoDetalle,
    isError,
    error,
  } = useProjectMemberDetail(idProyecto, idUsuarioNum);

  const volverHref = `/dashboard/proyectos/${id}/equipo`;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <Link
        href={volverHref}
        className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al equipo
      </Link>

      {cargandoPermisos && <DetalleSkeleton />}

      {!cargandoPermisos && !isLeader && (
        <LeaderOnlyNotice
          title="Solo el líder puede ver este detalle"
          description="El desglose de tareas y horas de un integrante es visible únicamente para quien lidera el proyecto."
        />
      )}

      {!cargandoPermisos && isLeader && (
        <>
          {cargandoDetalle && <DetalleSkeleton />}

          {!cargandoDetalle && isError && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center">
              <ShieldAlert className="w-10 h-10 text-error mx-auto mb-3" />
              <p className="text-sm text-error">
                {error instanceof Error ? error.message : 'No se pudo cargar el detalle del integrante.'}
              </p>
            </div>
          )}

          {!cargandoDetalle && detalle && (
            <DetalleIntegranteContent idProyecto={idProyecto} detalle={detalle} />
          )}
        </>
      )}
    </div>
  );
}

function DetalleIntegranteContent({
  detalle,
}: {
  idProyecto: number;
  detalle: NonNullable<ReturnType<typeof useProjectMemberDetail>['data']>;
}) {
  const { usuario, participaciones, tareas, sprints } = detalle;
  const totalHorasReales = sumaHorasReales(tareas);
  const sprintsOrdenados = ordenarSprintsDescendente(sprints);

  return (
    <div className="space-y-6">
      {/* Encabezado del integrante */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex items-start gap-4">
          <Avatar className="size-14 shrink-0">
            {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary/10 text-base font-bold text-primary">
              {getInitials(usuario.nombre, usuario.apellido)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <UserRound className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
              <h1 className="font-headline font-extrabold text-2xl text-on-surface truncate">
                {usuario.nombre} {usuario.apellido}
              </h1>
            </div>
            <p className="text-sm text-tertiary mb-3">{usuario.correo}</p>

            <div className="flex flex-wrap gap-2">
              {participaciones.map((participacion) => {
                const estilo = ESTADO_PARTICIPACION_STYLE[participacion.estadoParticipacion];
                return (
                  <span
                    key={participacion.idParticipacion}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${estilo.className}`}
                    title={
                      participacion.fechaSalida
                        ? `Desde ${formatearFechaLimite(participacion.fechaIngreso)} hasta ${formatearFechaLimite(participacion.fechaSalida)}`
                        : `Desde ${formatearFechaLimite(participacion.fechaIngreso)}`
                    }
                  >
                    {participacion.rolProyecto.nombreRol} · {estilo.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Total de horas — justifica reconocimiento */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 flex items-center gap-3">
        <div className="flex items-center justify-center size-11 rounded-xl bg-primary/10 shrink-0">
          <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold text-tertiary uppercase tracking-wide">
            Total de horas reales
          </p>
          <p className="text-2xl font-headline font-extrabold text-on-surface">
            {totalHorasReales.toLocaleString('es-GT', { maximumFractionDigits: 2 })} h
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-bold text-tertiary uppercase tracking-wide">Tareas</p>
          <p className="text-2xl font-headline font-extrabold text-on-surface">{tareas.length}</p>
        </div>
      </div>

      {/* Historial por Sprint — F15, agrupación entregada por B14, nunca reconstruida aquí */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <ListChecks className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="font-headline font-bold text-lg text-on-surface">
              Historial por Sprint
            </h2>
            <p className="text-sm text-tertiary">
              Actividad, tareas y horas reconocidas del integrante organizadas por Sprint.
            </p>
          </div>
        </div>

        {sprintsOrdenados.length === 0 && (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <ListChecks aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Este integrante aún no tiene actividad registrada en Sprints.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {sprintsOrdenados.map((sprint) => (
          <MemberSprintHistoryCard key={sprint.idSprint} sprint={sprint} />
        ))}
      </div>
    </div>
  );
}

function MemberSprintHistoryCard({ sprint }: { sprint: HistorialSprintIntegranteDTO }) {
  const estilo = ESTADO_SPRINT_STYLE[sprint.estado];
  const headingId = `sprint-historial-${sprint.idSprint}`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="text-base font-bold text-on-surface">
                Sprint {sprint.numero}
              </h3>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
              >
                {estilo.label}
              </span>
            </div>
            <p className="text-xs text-tertiary mt-0.5">
              {sprint.fechaCierre
                ? `${formatearFechaHora(sprint.fechaInicio)} – ${formatearFechaHora(sprint.fechaCierre)}`
                : formatearFechaHora(sprint.fechaInicio)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-tertiary shrink-0" aria-hidden="true" />
            <div>
              <p className="text-base font-bold text-on-surface leading-tight">
                {sprint.tareas.length}
              </p>
              <p className="text-[11px] text-tertiary whitespace-nowrap">
                {sprint.tareas.length === 1 ? 'tarea realizada' : 'tareas realizadas'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-base font-bold text-on-surface leading-tight">
                {formatearHoras(sprint.horasAprobadas)} h
              </p>
              <p className="text-[11px] text-tertiary whitespace-nowrap">horas reconocidas</p>
            </div>
          </div>
        </div>
      </div>

      {sprint.tareas.length === 0 ? (
        <p className="border-t border-outline-variant/40 px-5 py-4 text-sm text-tertiary">
          No hay tareas registradas para este Sprint.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant/40 border-t border-outline-variant/40">
          {sprint.tareas.map((tarea) => {
            const estiloTarea = ESTADO_COLUMNA_STYLE[tarea.estadoTarea];
            return (
              <li key={tarea.idTarea} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {tarea.estadoTarea === 'HECHO' ? (
                  <CheckCircle2
                    className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="w-4 h-4 text-tertiary/40 shrink-0" aria-hidden="true" />
                )}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
                  {tarea.tituloTarea}
                </p>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${estiloTarea.headerBg} ${estiloTarea.headerText}`}
                >
                  {ESTADO_LABEL[tarea.estadoTarea]}
                </span>
                <span className="shrink-0 text-sm font-bold text-on-surface">
                  {tarea.horasReales !== null ? `${formatearHoras(tarea.horasReales)} h` : '— h'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
