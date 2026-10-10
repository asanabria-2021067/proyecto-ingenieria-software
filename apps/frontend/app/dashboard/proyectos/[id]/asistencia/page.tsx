'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, CalendarCheck, Lock, MousePointerClick, Users } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useActividadDetalle, useMarcarAsistencia, useProjectActividades } from '@/hooks/use-project-attendance';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { aviso } from '@/lib/mensajes';
import { formatearHoras } from '@/lib/hours/format';
import { cn } from '@/lib/utils';
import type { ActividadResumen, IntegranteAsistencia, TipoActividad } from '@/lib/types/attendance';

const TIPO_LABEL: Record<TipoActividad, string> = {
  REUNION: 'Reunión',
  JORNADA: 'Jornada',
  TALLER: 'Taller',
  OTRO: 'Otro',
};

/** Estados donde el backend admite ACTIVIDAD_ASISTENCIA (familia con estados P/E). */
const ESTADOS_EDITABLES = ['PUBLICADO', 'EN_PROGRESO'];

const RETRY_CLASS =
  'inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90';

type EstadoAsistencia = 'asistio' | 'ausente' | 'sin-registrar';

/**
 * El backend responde `asistio: false` tanto para una ausencia confirmada
 * como cuando aún no hay fila; `confirmadoEn` es lo que las distingue.
 */
function estadoDe(integrante: IntegranteAsistencia): EstadoAsistencia {
  if (integrante.asistio) return 'asistio';
  return integrante.confirmadoEn ? 'ausente' : 'sin-registrar';
}

const ESTADO_UI: Record<EstadoAsistencia, { label: string; pill: string }> = {
  asistio: { label: 'Asistió', pill: 'pill-success' },
  ausente: { label: 'No asistió', pill: 'pill-error' },
  'sin-registrar': { label: 'Sin registrar', pill: 'pill-neutral' },
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** `fechaActividad` llega como `YYYY-MM-DD`: se lee en hora local para no correr el día. */
function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ActividadItem({
  actividad,
  seleccionada,
  onSeleccionar,
}: {
  actividad: ActividadResumen;
  seleccionada: boolean;
  onSeleccionar: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSeleccionar}
        aria-pressed={seleccionada}
        className={cn(
          'w-full rounded-card border bg-surface-container-lowest p-card text-left shadow-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          seleccionada ? 'border-primary ring-1 ring-primary' : 'border-outline-variant',
        )}
      >
        <div className="flex flex-wrap items-center gap-tight">
          <span className="pill pill-neutral">{TIPO_LABEL[actividad.tipoActividad]}</span>
          <time className="type-meta ml-auto shrink-0" dateTime={actividad.fechaActividad}>
            {formatearFecha(actividad.fechaActividad)}
          </time>
        </div>
        <p className="type-subtitle mt-tight break-words text-text-primary">{actividad.tituloActividad}</p>
        <p className="type-meta mt-micro">
          {formatearHoras(String(actividad.horasValor))} · {actividad.totalAsistieron} de {actividad.totalIntegrantes}{' '}
          asistieron
        </p>
      </button>
    </li>
  );
}

function IntegranteFila({
  integrante,
  esActual,
  editable,
  guardando,
  onCambiar,
}: {
  integrante: IntegranteAsistencia;
  esActual: boolean;
  editable: boolean;
  guardando: boolean;
  onCambiar: (asistio: boolean) => void;
}) {
  const estado = ESTADO_UI[estadoDe(integrante)];
  const nombreCompleto = `${integrante.nombre} ${integrante.apellido}`;
  const checkboxId = `asistencia-${integrante.idUsuario}`;

  return (
    <li
      className={cn(
        'flex items-center gap-inline rounded-control px-tight py-tight',
        esActual && 'bg-primary/5',
      )}
    >
      <Avatar className="size-9 shrink-0">
        {integrante.fotoUrl && <AvatarImage src={integrante.fotoUrl} alt="" />}
        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
          {getInitials(integrante.nombre, integrante.apellido)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="type-body truncate text-text-primary">
          {nombreCompleto}
          {esActual && <span className="type-meta ml-1.5">(Tú)</span>}
        </p>
        <span className={cn('pill mt-micro', estado.pill)}>{estado.label}</span>
      </div>
      {editable && (
        <div className="flex shrink-0 items-center gap-tight">
          {guardando && <Spinner aria-label="Guardando asistencia" />}
          <Checkbox
            id={checkboxId}
            checked={integrante.asistio}
            disabled={guardando}
            onCheckedChange={(valor) => onCambiar(valor === true)}
            aria-label={`Asistencia de ${nombreCompleto}`}
            className="size-5"
          />
          <label htmlFor={checkboxId} className="type-meta hidden cursor-pointer sm:inline">
            Asistió
          </label>
        </div>
      )}
    </li>
  );
}

function PanelDetalle({
  idProyecto,
  idActividad,
  idUsuarioActual,
  editable,
}: {
  idProyecto: number;
  idActividad: number;
  idUsuarioActual: number | null;
  editable: boolean;
}) {
  const { actividad, isLoading, isError, error, refetch } = useActividadDetalle(idProyecto, idActividad);
  const marcar = useMarcarAsistencia(idProyecto);
  // Un PATCH en curso por integrante: su control queda bloqueado hasta que
  // el servidor confirme o rechace, así un doble clic no dispara dos. La ref
  // corta el reenvío aunque el estado aún no se haya vuelto a pintar.
  const enCurso = useRef(new Set<number>());
  const [pendientes, setPendientes] = useState<ReadonlySet<number>>(() => new Set());

  async function cambiarAsistencia(integrante: IntegranteAsistencia, asistio: boolean) {
    if (enCurso.current.has(integrante.idUsuario)) return;
    enCurso.current.add(integrante.idUsuario);
    setPendientes((actual) => new Set(actual).add(integrante.idUsuario));
    const nombreCompleto = `${integrante.nombre} ${integrante.apellido}`;
    try {
      await marcar.mutateAsync({ idActividad, idUsuario: integrante.idUsuario, asistio });
      aviso.exito(
        asistio ? 'Asistencia registrada' : 'Asistencia retirada',
        asistio ? `${nombreCompleto} quedó marcado como presente.` : `${nombreCompleto} quedó sin asistencia.`,
      );
    } catch (err) {
      aviso.error('No se pudo guardar la asistencia', getApiErrorMessage(err, 'general'));
    } finally {
      enCurso.current.delete(integrante.idUsuario);
      setPendientes((actual) => {
        const siguiente = new Set(actual);
        siguiente.delete(integrante.idUsuario);
        return siguiente;
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-stack" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-14 w-full rounded-card" />
        <Skeleton className="h-14 w-full rounded-card" />
      </div>
    );
  }

  if (isError || !actividad) {
    return (
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {getApiErrorMessage(error, 'general', 'No fue posible cargar la asistencia de esta actividad.')}
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <button type="button" onClick={() => refetch()} className={RETRY_CLASS}>
            Reintentar
          </button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-stack">
        <h2 className="type-section break-words text-text-primary">{actividad.tituloActividad}</h2>
        <p className="type-meta mt-micro">
          {TIPO_LABEL[actividad.tipoActividad]} · {formatearFecha(actividad.fechaActividad)} ·{' '}
          {formatearHoras(String(actividad.horasValor))}
        </p>
      </div>

      {actividad.integrantes.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Users aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>El proyecto no tiene integrantes activos.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul aria-label="Asistencia por integrante" className="space-y-micro">
          {actividad.integrantes.map((integrante) => (
            <IntegranteFila
              key={integrante.idUsuario}
              integrante={integrante}
              esActual={integrante.idUsuario === idUsuarioActual}
              editable={editable}
              guardando={pendientes.has(integrante.idUsuario)}
              onCambiar={(asistio) => cambiarAsistencia(integrante, asistio)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AsistenciaPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const { members, isLoading: cargandoMembers } = useProjectMembers(idProyecto);
  const isLeader = useIsProjectLeader(idProyecto);

  // Mismo criterio que Bitácora: líder o integrante activo. El backend
  // (scope `asistencia`) es quien realmente autoriza la lectura.
  const esParticipante = !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeVer = isLeader || esParticipante;
  // Solo el líder escribe, y solo en los estados que admite el backend; con
  // proyecto o usuario aún cargando `isLeader` es false y nada es editable.
  const estadoEditable = proyecto != null && ESTADOS_EDITABLES.includes(proyecto.estadoProyecto);
  const editable = isLeader && estadoEditable;

  const { actividades, isLoading, isError, error, refetch } = useProjectActividades(idProyecto, puedeVer);
  const [idSeleccionada, setIdSeleccionada] = useState<number | null>(null);

  const cargandoAcceso = cargandoProyecto || cargandoUsuario || cargandoMembers;
  const cargando = cargandoAcceso || isLoading;
  const actividadSeleccionada = actividades.find((a) => a.idActividad === idSeleccionada) ?? null;

  if (!cargandoAcceso && !puedeVer) {
    return (
      <ProjectPageShell>
        <ProjectBackLink href={`/dashboard/projects/${id}`} label="Volver al proyecto" className="mb-card" />
        <LeaderOnlyNotice
          title="No tienes acceso"
          description="Solo el líder y los integrantes del proyecto pueden consultar la asistencia."
        />
      </ProjectPageShell>
    );
  }

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/projects/${id}`, label: 'Volver al proyecto' }}
        title="Asistencia"
        description="Asistencia de los integrantes a las reuniones y actividades del proyecto."
      >
        {!cargandoAcceso && !isLeader && (
          <p className="type-meta mt-tight flex items-center gap-1.5 text-tertiary" role="status">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Estás viendo la asistencia en modo solo lectura: solo el líder puede modificarla.
          </p>
        )}
        {isLeader && !estadoEditable && (
          <p className="type-meta mt-tight flex items-center gap-1.5 text-tertiary" role="status">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            En el estado actual del proyecto la asistencia ya no puede modificarse.
          </p>
        )}
      </ProjectPageHeader>

      {cargando && (
        <div className="space-y-stack" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      )}

      {!cargando && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {getApiErrorMessage(error, 'general', 'No fue posible cargar las actividades del proyecto.')}
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <button type="button" onClick={() => refetch()} className={RETRY_CLASS}>
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      )}

      {!cargando && !isError && actividades.length === 0 && (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <CalendarCheck aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Todavía no hay actividades registradas.</EmptyTitle>
            <EmptyDescription>
              Cuando el proyecto registre reuniones o actividades, su asistencia aparecerá aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!cargando && !isError && actividades.length > 0 && (
        <div className="grid gap-section @3xl/project:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @3xl/project:items-start">
          <section aria-labelledby="titulo-actividades">
            <h2 id="titulo-actividades" className="type-subtitle mb-stack text-text-primary">
              Actividades
            </h2>
            <ul className="space-y-stack">
              {actividades.map((actividad) => (
                <ActividadItem
                  key={actividad.idActividad}
                  actividad={actividad}
                  seleccionada={actividad.idActividad === idSeleccionada}
                  onSeleccionar={() => setIdSeleccionada(actividad.idActividad)}
                />
              ))}
            </ul>
          </section>

          <section
            aria-label="Asistencia de la actividad"
            className="rounded-card border border-outline-variant bg-surface-container-lowest p-card shadow-card"
          >
            {actividadSeleccionada ? (
              <PanelDetalle
                key={actividadSeleccionada.idActividad}
                idProyecto={idProyecto}
                idActividad={actividadSeleccionada.idActividad}
                idUsuarioActual={currentUser?.idUsuario ?? null}
                editable={editable}
              />
            ) : (
              <Empty tone="muted" role="status">
                <EmptyMedia variant="icon">
                  <MousePointerClick aria-hidden="true" className="h-7 w-7" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>Selecciona una actividad</EmptyTitle>
                  <EmptyDescription>Verás a los integrantes del proyecto y su asistencia.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        </div>
      )}
    </ProjectPageShell>
  );
}
