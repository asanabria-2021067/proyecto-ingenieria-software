'use client';

import { useParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectMemberDetail } from '@/hooks/use-project-member-detail';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';
import {
  ESTADO_LABEL,
  ESTADO_TAREA_TONE,
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
import { getApiErrorMessage } from '@/components/projects/api-error';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import { ProjectBackLink, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

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

/** Fila que despliega su detalle (`<summary>`): sin marcador nativo y con foco visible por teclado. */
const DISCLOSURE_SUMMARY =
  'cursor-pointer list-none outline-none transition-colors hover:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden';

/** Indicador de expansión: gira cuando el `<details class="group">` que lo contiene está abierto. */
function DisclosureChevron() {
  return (
    <ChevronDown
      aria-hidden="true"
      className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"
    />
  );
}

function DetalleSkeleton() {
  return (
    <div className="flex flex-col gap-section" aria-busy="true" aria-label="Cargando detalle del integrante">
      <Skeleton className="h-14 w-72 max-w-full rounded-card" />
      <div className="grid grid-cols-1 gap-grid @xl/project:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-card" />
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

  return (
    <ProjectPageShell>
      <ProjectBackLink href={`/dashboard/proyectos/${id}/equipo`} label="Volver al equipo" className="mb-card" />

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
            <Empty tone="danger" role="alert">
              <EmptyHeader>
                <EmptyTitle>
                  {getApiErrorMessage(error, 'general', 'No se pudo cargar el detalle del integrante.')}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!cargandoDetalle && detalle && (
            <DetalleIntegranteContent
              detalle={detalle}
              candidato={candidato}
              horasHistoricas={horasHistoricas}
              proyectoCerrado={proyectoCerrado}
              mostrarElegibilidad={isLeader && !proyectoCerrado}
            />
          )}
        </>
      )}
    </ProjectPageShell>
  );
}

function DetalleIntegranteContent({
  detalle,
  candidato,
  horasHistoricas,
  proyectoCerrado,
  mostrarElegibilidad,
}: {
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
    <div className="flex flex-col gap-section">
      {/* Encabezado del integrante: directo sobre el fondo, sin tarjeta. */}
      <header className="flex items-start gap-stack">
        <Avatar className="size-12 shrink-0">
          {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
          <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
            {getInitials(usuario.nombre, usuario.apellido)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="type-display break-words text-text-primary">
            {usuario.nombre} {usuario.apellido}
          </h1>
          <p className="type-meta break-all">{usuario.correo}</p>
          <ul aria-label="Roles en el proyecto" className="mt-tight flex flex-wrap gap-x-stack gap-y-tight">
            {participaciones.map((participacion) => {
              const estilo = ESTADO_PARTICIPACION_STYLE[participacion.estadoParticipacion];
              return (
                <li key={participacion.idParticipacion} className="flex flex-wrap items-center gap-tight">
                  <span className="type-body font-semibold text-text-primary">
                    {participacion.rolProyecto.nombreRol}
                  </span>
                  <span className={`pill pill-sm ${estilo.className}`}>{estilo.label}</span>
                  <span className="type-meta tabular-nums">
                    Desde {formatearFechaLimite(participacion.fechaIngreso)}
                    {participacion.fechaSalida && ` hasta ${formatearFechaLimite(participacion.fechaSalida)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </header>

      {proyectoCerrado && (
        <p
          role="status"
          className="type-body rounded-card border border-outline-variant/50 bg-surface-container-low px-card py-inline text-text-secondary"
        >
          Proyecto cerrado: las horas acreditadas son definitivas y no existen acciones sobre el integrante.
        </p>
      )}

      {/* Indicadores principales. Las horas reales salen de `tareas` (contrato B14);
          las registradas, del servidor por integrante. */}
      <section aria-label="Resumen del integrante" className="grid grid-cols-1 gap-grid @xl/project:grid-cols-3">
        <HoursKpiCard variante="en-linea" label="Horas reales" value={`${formatearHoras(totalHorasReales)} h`} />
        <HoursKpiCard
          variante="en-linea"
          label="Horas registradas"
          value={registradas != null ? `${formatearDecimal(registradas)} h` : '—'}
        />
        <HoursKpiCard variante="en-linea" label="Tareas realizadas" value={String(tareas.length)} />
      </section>

      {/* Niveles secundarios (S7 V5 §4): una sola superficie; nunca se suman entre niveles. */}
      <section aria-labelledby="horas-niveles-title" className="card-base">
        <h2 id="horas-niveles-title" className="type-section text-text-primary">
          Desglose de horas
        </h2>
        <p className="type-meta mt-micro">
          Registradas y legacy provienen del servidor por integrante; propuestas y acreditadas se consolidan por Sprint. Los
          niveles no se suman entre sí.
        </p>
        <div className="mt-stack grid grid-cols-1 gap-x-card gap-y-stack border-t border-outline-variant/50 pt-stack @md/project:grid-cols-3">
          <HoursLevel label="Horas legacy" value={legacy != null ? `${formatearDecimal(legacy)} h` : '—'} />
          <HoursLevel label="Horas propuestas" value={`${formatearDecimal(propuestas)} h`} />
          <HoursLevel label="Horas acreditadas" value={`${formatearDecimal(acreditadas)} h`} />
        </div>
      </section>

      {mostrarElegibilidad && candidato && (
        <LeadershipEligibilityCard candidato={candidato} tareasDistintas={tareasDistintas} />
      )}

      {/* Historial por Sprint — F15, agrupación entregada por B14, nunca reconstruida aquí */}
      <section aria-labelledby="historial-sprints-title" className="flex flex-col gap-stack">
        <div>
          <h2 id="historial-sprints-title" className="type-section text-text-primary">
            Historial por Sprint
          </h2>
          <p className="type-meta mt-micro">
            Actividad, tareas y horas reconocidas del integrante organizadas por Sprint.
          </p>
        </div>

        {sprintsOrdenados.length === 0 ? (
          <div className="card-base">
            <Empty tone="flush" role="status">
              <EmptyHeader>
                <EmptyTitle>Este integrante aún no tiene actividad registrada en Sprints.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="card-base divide-y divide-outline-variant/50 overflow-hidden p-0">
            {sprintsOrdenados.map((sprint) => (
              <MemberSprintHistoryRow key={sprint.idSprint} sprint={sprint} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Nivel de horas del desglose: rótulo pequeño y cifra, sin tarjeta ni icono (mismo lenguaje que las métricas de Sprints). */
function HoursLevel({ label, value }: { label: string; value: string }) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      <p className="type-meta">{label}</p>
      <p className="mt-micro type-subtitle font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

/**
 * Elegibilidad para liderazgo: una franja con el estado y su explicación; los
 * criterios técnicos quedan en el desplegable (abierto de entrada cuando hay
 * motivos de inelegibilidad, que es lo que el líder necesita leer).
 */
function LeadershipEligibilityCard({
  candidato,
  tareasDistintas,
}: {
  candidato: LeadershipCandidateDto;
  tareasDistintas: number;
}) {
  const totalMotivos = candidato.motivos.length;

  return (
    <section aria-labelledby="elegibilidad-title" className="card-base overflow-hidden p-0">
      <details className="group" open={totalMotivos > 0}>
        <summary className={`flex flex-wrap items-center gap-x-stack gap-y-tight px-card py-inline ${DISCLOSURE_SUMMARY}`}>
          <h2 id="elegibilidad-title" className="type-body font-semibold text-text-primary">
            Elegibilidad para liderazgo
          </h2>
          <span className={`pill ${candidato.esElegible ? 'pill-success' : 'pill-neutral'}`}>
            {candidato.esElegible ? 'Elegible' : 'No elegible'}
          </span>
          <p className="type-meta order-last min-w-0 basis-full @2xl/project:order-none @2xl/project:flex-1 @2xl/project:basis-0">
            {totalMotivos === 0
              ? 'Cumple los criterios objetivos para recibir el liderazgo.'
              : totalMotivos === 1
                ? 'No cumple 1 criterio objetivo.'
                : `No cumple ${totalMotivos} criterios objetivos.`}
          </p>
          <span className="type-meta ml-auto flex items-center gap-micro">
            Criterios
            <DisclosureChevron />
          </span>
        </summary>
        <div className="border-t border-outline-variant/50 px-card py-stack">
          {totalMotivos > 0 && (
            <ul aria-label="Motivos de inelegibilidad" className="type-body mb-stack list-disc space-y-micro pl-5 text-text-primary">
              {candidato.motivos.map((motivo) => (
                <li key={motivo}>{motivoInelegibilidadLabel(motivo)}</li>
              ))}
            </ul>
          )}
          <p className="type-meta">
            Criterios objetivos del servidor; no existe ranking ni recomendación automática. Tareas distintas:{' '}
            <span className="font-semibold text-text-primary">{tareasDistintas}</span>.
          </p>
        </div>
      </details>
    </section>
  );
}

/**
 * Sprint del historial: fila compacta que se despliega para mostrar las
 * actividades individuales. Los Sprints en curso llegan abiertos; los cerrados,
 * plegados.
 */
function MemberSprintHistoryRow({ sprint }: { sprint: HistorialSprintIntegranteDTO }) {
  const estilo = ESTADO_SPRINT_STYLE[sprint.estado];
  const headingId = `sprint-historial-${sprint.idSprint}`;
  const totalTareas = sprint.tareas.length;

  return (
    <section aria-labelledby={headingId}>
      <details className="group" open={sprint.estado !== 'CERRADO'}>
        <summary
          className={`flex flex-col gap-tight px-card py-inline @2xl/project:flex-row @2xl/project:items-center @2xl/project:justify-between ${DISCLOSURE_SUMMARY}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-inline gap-y-micro">
            <h3 id={headingId} className="type-body font-semibold text-text-primary">
              Sprint {sprint.numero}
            </h3>
            <span className={`pill ${estilo.className}`}>{estilo.label}</span>
            <p className="type-meta tabular-nums">
              {formatearFechaHora(sprint.fechaInicio)}
              {sprint.fechaCierre && ` → ${formatearFechaHora(sprint.fechaCierre)}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-inline">
            <p className="type-meta tabular-nums">
              <span className="font-semibold text-text-primary">{totalTareas}</span>{' '}
              {totalTareas === 1 ? 'tarea realizada' : 'tareas realizadas'}
              {' · '}
              <span className="font-semibold text-text-primary">{formatearHoras(sprint.horasAprobadas)} h</span>{' '}
              reconocidas
            </p>
            <DisclosureChevron />
          </div>
        </summary>

        {totalTareas === 0 ? (
          <p className="type-meta border-t border-outline-variant/50 bg-surface-container-low/50 px-card py-inline">
            No hay tareas registradas para este Sprint.
          </p>
        ) : (
          <ul
            aria-label={`Actividades del Sprint ${sprint.numero}`}
            className="divide-y divide-outline-variant/40 border-t border-outline-variant/50 bg-surface-container-low/50"
          >
            {sprint.tareas.map((tarea) => (
              <li key={tarea.idTarea} className="flex flex-wrap items-center gap-inline px-card py-tight">
                <p className="type-body min-w-0 flex-1 truncate text-text-primary">{tarea.tituloTarea}</p>
                <span className={`pill pill-sm shrink-0 pill-${ESTADO_TAREA_TONE[tarea.estadoTarea]}`}>
                  {ESTADO_LABEL[tarea.estadoTarea]}
                </span>
                <span className="type-body w-16 shrink-0 text-right font-semibold tabular-nums text-text-primary">
                  {tarea.horasReales !== null ? `${formatearHoras(tarea.horasReales)} h` : '— h'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
