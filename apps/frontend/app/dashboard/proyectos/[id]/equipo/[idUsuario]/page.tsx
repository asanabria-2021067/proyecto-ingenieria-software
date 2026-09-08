'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  History,
  ListChecks,
  Lock,
  ShieldAlert,
  ShieldCheck,
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
import { useLeadershipCandidates } from '@/hooks/use-leadership';
import { useHistoricalProject } from '@/hooks/use-historical-project';
import { motivoInelegibilidadLabel, type LeadershipCandidateDto } from '@/lib/types/leadership';
import type { HistoricalHorasUsuario } from '@/lib/services/historical';
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

/** Los importes S7 llegan como string decimal: se formatean, nunca se convierten a `Number` para mostrarlos. */
function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

/** Suma de importes numéricos del contrato B14 en centésimas enteras (sin coma flotante). */
function sumarEnCentesimas(valores: number[]): string {
  const total = valores.reduce((acc, v) => acc + Math.round(v * 100), 0);
  return `${Math.floor(total / 100)}.${String(total % 100).padStart(2, '0')}`;
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

  // S7 (VIEW-07): NO existe endpoint de «horas de proyecto por usuario». Las
  // horas se derivan del detalle de equipo; la elegibilidad objetiva (solo
  // para el líder) de `GET liderazgo/candidatos`; y en proyecto CERRADO las
  // horas acreditadas definitivas del histórico.
  const estadoProyecto = proyecto?.estadoProyecto;
  const proyectoCerrado = estadoProyecto === 'CERRADO';
  const candidatosQuery = useLeadershipCandidates(idProyecto, isLeader && !proyectoCerrado);
  const historicoQuery = useHistoricalProject(idProyecto, isLeader && proyectoCerrado);
  const candidato = candidatosQuery.data?.candidatos.find((c) => c.idUsuario === idUsuarioNum) ?? null;
  const horasHistoricas =
    historicoQuery.data?.totales.porUsuario.find((u) => u.idUsuario === idUsuarioNum) ?? null;

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
            <DetalleIntegranteContent
              idProyecto={idProyecto}
              detalle={detalle}
              candidato={candidato}
              horasHistoricas={horasHistoricas}
              proyectoCerrado={proyectoCerrado}
              mostrarElegibilidad={isLeader && !proyectoCerrado}
            />
          )}
        </>
      )}
    </div>
  );
}

function DetalleIntegranteContent({
  detalle,
  candidato,
  horasHistoricas,
  proyectoCerrado,
  mostrarElegibilidad,
}: {
  idProyecto: number;
  detalle: NonNullable<ReturnType<typeof useProjectMemberDetail>['data']>;
  candidato: LeadershipCandidateDto | null;
  horasHistoricas: HistoricalHorasUsuario | null;
  proyectoCerrado: boolean;
  mostrarElegibilidad: boolean;
}) {
  const { usuario, participaciones, tareas, sprints } = detalle;
  const totalHorasReales = sumaHorasReales(tareas);
  const sprintsOrdenados = ordenarSprintsDescendente(sprints);

  // Niveles de horas (V5 §4): registradas · legacy · propuestas · acreditadas.
  // Preferencia por los string decimales del backend; el fallback numérico
  // (B14) se suma en centésimas enteras.
  const registradas = horasHistoricas?.reportadasGranulares ?? candidato?.horasReportadas ?? null;
  const legacy = horasHistoricas?.legacy ?? candidato?.horasLegacy ?? null;
  const propuestas = horasHistoricas?.propuestasPendientes ?? sumarEnCentesimas(sprints.map((s) => s.horasCalculadas));
  const acreditadas = horasHistoricas?.acreditadas ?? sumarEnCentesimas(sprints.map((s) => s.horasAprobadas));
  const tareasDistintas = horasHistoricas?.tareasDistintas ?? candidato?.tareasDistintas ?? tareas.length;

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

      {proyectoCerrado && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant"
        >
          <Lock className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          Proyecto cerrado: las horas acreditadas son definitivas y no existen acciones sobre el integrante.
        </p>
      )}

      {/* Total de horas — justifica reconocimiento (contrato B14, se conserva) */}
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

      {/* Horas por nivel (S7 V5 §4) — nunca se suman entre niveles */}
      <section aria-labelledby="horas-niveles-title" className="space-y-2">
        <h2 id="horas-niveles-title" className="sr-only">
          Horas del integrante por nivel
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HorasKpi icon={Clock} label="Horas registradas" value={registradas != null ? `${formatearDecimal(registradas)} h` : '—'} />
          <HorasKpi icon={History} label="Horas legacy" value={legacy != null ? `${formatearDecimal(legacy)} h` : '—'} />
          <HorasKpi icon={Calendar} label="Horas propuestas" value={`${formatearDecimal(propuestas)} h`} />
          <HorasKpi icon={CheckCircle2} label="Horas acreditadas" value={`${formatearDecimal(acreditadas)} h`} destacado />
        </div>
        <p className="text-xs text-tertiary">
          Registradas y legacy provienen del servidor por integrante; propuestas y acreditadas se consolidan por Sprint. Los
          niveles no se suman entre sí.
        </p>
      </section>

      {mostrarElegibilidad && candidato && (
        <section
          aria-labelledby="elegibilidad-title"
          className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="elegibilidad-title" className="flex items-center gap-2 text-base font-bold text-on-surface">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              Elegibilidad para liderazgo
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                candidato.esElegible ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {candidato.esElegible ? 'Elegible' : 'No elegible'}
            </span>
          </div>
          <p className="mt-1 text-xs text-tertiary">
            Criterios objetivos del servidor; no existe ranking ni recomendación automática. Tareas distintas:{' '}
            <span className="font-semibold text-on-surface">{tareasDistintas}</span>.
          </p>
          {candidato.motivos.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-on-surface-variant" aria-label="Motivos de inelegibilidad">
              {candidato.motivos.map((motivo) => (
                <li key={motivo} className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
                  {motivoInelegibilidadLabel(motivo)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-on-surface-variant">Cumple los criterios objetivos para recibir el liderazgo.</p>
          )}
        </section>
      )}

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

function HorasKpi({
  icon: Icon,
  label,
  value,
  destacado = false,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  destacado?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${destacado ? 'bg-primary/15' : 'bg-primary/10'}`}>
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-tertiary">{label}</p>
        <p className="font-headline text-2xl font-extrabold text-on-surface">{value}</p>
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
