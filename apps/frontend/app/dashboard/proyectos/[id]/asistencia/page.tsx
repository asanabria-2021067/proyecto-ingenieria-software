'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, CalendarCheck2, ChevronDown, Lock, Plus, Users } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectActivities, useProjectActivity, useProjectAttendanceMutations } from '@/hooks/use-project-attendance';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { CreateActivityDialog } from '@/components/projects/attendance/create-activity-dialog';
import { AttendanceSwitch } from '@/components/projects/attendance/attendance-switch';
import { TIPO_ACTIVIDAD_LABEL } from '@/components/projects/attendance/activity-type.utils';
import type { ActividadResumen } from '@/lib/types/attendance';

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00.000Z`).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function ActivityRowSkeleton() {
  return <Skeleton className="h-20 w-full rounded-card" />;
}

function ActivityDetail({
  idProyecto,
  idActividad,
  isLeader,
  marcarAsistencia,
}: {
  idProyecto: number;
  idActividad: number;
  isLeader: boolean;
  marcarAsistencia: ReturnType<typeof useProjectAttendanceMutations>['marcarAsistencia'];
}) {
  const { actividad, isLoading, isError, error, refetch } = useProjectActivity(idProyecto, idActividad);

  if (isLoading) {
    return (
      <div className="space-y-tight px-card pb-card">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !actividad) {
    return (
      <div className="px-card pb-card">
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-6 w-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'task', 'No fue posible cargar el detalle de la actividad.')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <ul className="space-y-tight px-card pb-card">
      {actividad.integrantes.map((integrante) => (
        <li
          key={integrante.idUsuario}
          className="flex items-center justify-between gap-inline rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2"
        >
          <div className="flex items-center gap-tight">
            <Avatar className="size-7 shrink-0">
              {integrante.fotoUrl && <AvatarImage src={integrante.fotoUrl} alt="" />}
              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                {getInitials(integrante.nombre, integrante.apellido)}
              </AvatarFallback>
            </Avatar>
            <span className="type-body text-text-primary">
              {integrante.nombre} {integrante.apellido}
            </span>
          </div>
          {isLeader ? (
            <AttendanceSwitch idActividad={idActividad} integrante={integrante} marcarAsistencia={marcarAsistencia} />
          ) : (
            <span className={`pill ${integrante.asistio ? 'pill-accent' : 'pill-neutral'}`}>
              {integrante.asistio ? 'Asistió' : 'No asistió'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActivityRow({
  actividad,
  isLeader,
  idProyecto,
  abierta,
  onToggle,
  marcarAsistencia,
}: {
  actividad: ActividadResumen;
  isLeader: boolean;
  idProyecto: number;
  abierta: boolean;
  onToggle: () => void;
  marcarAsistencia: ReturnType<typeof useProjectAttendanceMutations>['marcarAsistencia'];
}) {
  return (
    <Collapsible open={abierta} onOpenChange={onToggle}>
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest shadow-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-inline p-card text-left"
            aria-expanded={abierta}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-tight">
                <span className="pill pill-accent">{TIPO_ACTIVIDAD_LABEL[actividad.tipoActividad]}</span>
                <p className="type-subtitle text-text-primary">{actividad.tituloActividad}</p>
              </div>
              <p className="type-meta mt-micro">
                {formatearFecha(actividad.fechaActividad)} · {actividad.horasValor}{' '}
                {actividad.horasValor === 1 ? 'hora' : 'horas'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-tight">
              <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
                <Users className="size-4" aria-hidden="true" />
                {actividad.totalAsistieron}/{actividad.totalIntegrantes}
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-text-secondary transition-transform ${abierta ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {abierta && (
            <ActivityDetail
              idProyecto={idProyecto}
              idActividad={actividad.idActividad}
              isLeader={isLeader}
              marcarAsistencia={marcarAsistencia}
            />
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function AsistenciaPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = useIsProjectLeader(idProyecto);
  const { members, isLoading: cargandoMembers } = useProjectMembers(idProyecto);
  const esParticipante = !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeVer = isLeader || esParticipante;

  const { actividades, isLoading, isError, error, refetch } = useProjectActivities(idProyecto, puedeVer);
  const { crearActividad, marcarAsistencia } = useProjectAttendanceMutations(idProyecto);

  const cargandoPermisos = cargandoProyecto || cargandoUsuario || cargandoMembers;
  const cargando = isLoading || cargandoPermisos;

  return (
    <ProjectPageShell>
      {!cargandoPermisos && !puedeVer ? (
        <>
          <ProjectBackLink href={`/dashboard/proyectos/${id}`} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder a la asistencia de este proyecto." />
        </>
      ) : (
        <>
          <ProjectPageHeader
            back={{ href: isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`, label: 'Volver al proyecto' }}
            title="Asistencia"
            description="Actividades del proyecto, el valor en horas de extensión y quiénes asistieron."
            actions={
              isLeader && (
                <Button type="button" onClick={() => setDialogoAbierto(true)} className="gap-1.5">
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva actividad
                </Button>
              )
            }
          >
            {!isLeader && (
              <p className="type-meta mt-tight flex items-center gap-1.5 text-tertiary" role="status">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Estás viendo esta pantalla en modo solo lectura: no puedes crear actividades ni marcar asistencia.
              </p>
            )}
          </ProjectPageHeader>

          {cargando && (
            <SkeletonRegion label="Cargando actividades" className="space-y-stack">
              <ActivityRowSkeleton />
              <ActivityRowSkeleton />
              <ActivityRowSkeleton />
            </SkeletonRegion>
          )}

          {!cargando && isError && (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {getApiErrorMessage(error, 'task', 'No fue posible cargar las actividades del proyecto.')}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!cargando && !isError && actividades.length === 0 && (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <CalendarCheck2 aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Todavía no hay actividades.</EmptyTitle>
                <EmptyDescription>
                  {isLeader
                    ? 'Crea la primera actividad del proyecto para empezar a registrar asistencia.'
                    : 'Cuando el líder registre una actividad, aparecerá aquí.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!cargando && !isError && actividades.length > 0 && (
            <section aria-label="Actividades del proyecto" className="space-y-stack">
              {actividades.map((actividad) => (
                <ActivityRow
                  key={actividad.idActividad}
                  actividad={actividad}
                  isLeader={isLeader}
                  idProyecto={idProyecto}
                  abierta={abiertaId === actividad.idActividad}
                  onToggle={() =>
                    setAbiertaId((current) => (current === actividad.idActividad ? null : actividad.idActividad))
                  }
                  marcarAsistencia={marcarAsistencia}
                />
              ))}
            </section>
          )}

          {isLeader && (
            <CreateActivityDialog open={dialogoAbierto} onOpenChange={setDialogoAbierto} crearActividad={crearActividad} />
          )}
        </>
      )}
    </ProjectPageShell>
  );
}
