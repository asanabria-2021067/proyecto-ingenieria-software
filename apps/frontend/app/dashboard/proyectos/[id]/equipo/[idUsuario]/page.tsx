'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
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
import {
  COLUMNAS_TABLERO,
  ESTADO_COLUMNA_STYLE,
  ESTADO_LABEL,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  formatearFechaLimite,
} from '@/components/projects/task-board.utils';
import type { EstadoTarea } from '@/lib/types/tasks';
import type { TareaHistorialIntegranteDTO } from '@/lib/dto/member-detail.dto';
import { ESTADO_PARTICIPACION_STYLE } from '@/components/projects/member-status.utils';

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

function agruparPorEstado(
  tareas: TareaHistorialIntegranteDTO[],
): Record<EstadoTarea, TareaHistorialIntegranteDTO[]> {
  const grupos: Record<EstadoTarea, TareaHistorialIntegranteDTO[]> = {
    POR_HACER: [],
    EN_PROGRESO: [],
    EN_REVISION: [],
    HECHO: [],
  };
  for (const tarea of tareas) grupos[tarea.estadoTarea].push(tarea);
  return grupos;
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
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center">
          <ShieldAlert className="w-10 h-10 text-error mx-auto mb-3" />
          <h1 className="font-headline font-bold text-lg text-on-surface mb-1">
            Solo el líder puede ver este detalle
          </h1>
          <p className="text-sm text-tertiary">
            El desglose de tareas y horas de un integrante es visible únicamente para quien lidera el proyecto.
          </p>
        </div>
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
  const { usuario, participaciones, tareas } = detalle;
  const totalHorasReales = sumaHorasReales(tareas);
  const grupos = agruparPorEstado(tareas);

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

      {/* Desglose de tareas por estado */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="font-headline font-bold text-lg text-on-surface">
            Tareas por estado
          </h2>
        </div>

        {tareas.length === 0 && (
          <p className="text-sm text-tertiary py-6 text-center">
            Este integrante no tiene tareas asignadas (activas ni pasadas) en el proyecto.
          </p>
        )}

        {COLUMNAS_TABLERO.map((columna) => {
          const tareasDelGrupo = grupos[columna.estado];
          if (tareasDelGrupo.length === 0) return null;
          const estilo = ESTADO_COLUMNA_STYLE[columna.estado];
          const horasDelGrupo = sumaHorasReales(tareasDelGrupo);

          return (
            <div
              key={columna.estado}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden"
            >
              <div className={`flex items-center gap-2 px-5 py-3 ${estilo.headerBg}`}>
                <span className={`size-2 rounded-full ${estilo.dot}`} aria-hidden="true" />
                <span className={`text-sm font-bold ${estilo.headerText}`}>
                  {ESTADO_LABEL[columna.estado]}
                </span>
                <span className={`text-xs font-medium ${estilo.headerText} opacity-80`}>
                  ({tareasDelGrupo.length})
                </span>
                <span className={`ml-auto text-sm font-bold ${estilo.headerText}`}>
                  {horasDelGrupo.toLocaleString('es-GT', { maximumFractionDigits: 2 })} h
                </span>
              </div>

              <ul className="divide-y divide-outline-variant/40">
                {tareasDelGrupo.map((tarea) => {
                  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
                  return (
                    <li key={tarea.idTarea} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-on-surface truncate">
                          {tarea.tituloTarea}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-tertiary">
                          <span className={`inline-flex items-center gap-1 font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
                            <PrioridadIcon className="size-3" aria-hidden="true" />
                            {PRIORIDAD_LABEL[tarea.prioridad]}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="size-3" aria-hidden="true" />
                            {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha límite'}
                          </span>
                          <span>
                            Asignada: {formatearFechaHora(tarea.fechaAsignacion)}
                            {tarea.desasignadaEn && ` · Desasignada: ${formatearFechaHora(tarea.desasignadaEn)}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-on-surface">
                          {tarea.horasReales !== null
                            ? `${tarea.horasReales.toLocaleString('es-GT', { maximumFractionDigits: 2 })} h`
                            : '— h'}
                        </p>
                        <p className="text-xs text-tertiary">
                          Estimado: {tarea.tiempoEstimadoHoras !== null ? `${tarea.tiempoEstimadoHoras} h` : '—'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
