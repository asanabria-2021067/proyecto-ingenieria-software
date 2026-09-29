'use client';

import { useParams } from 'next/navigation';
import { AlertCircle, BriefcaseBusiness, Calendar, Clock3, UserRoundPlus, Users, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectPendingPostulations, useResolvePostulacion } from '@/hooks/use-project-pending-postulations';
import { aviso, confirmar } from '@/lib/mensajes';
import type { PostulacionRecibida } from '@/types';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';

type Accion = 'ACEPTADA' | 'RECHAZADA';

interface ConfirmTarget {
  postulacion: PostulacionRecibida;
  accion: Accion;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatFecha(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function MetricCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  // Mismo KPI que Mis Horas: icono neutro al par de la etiqueta, cifra grande.
  return <HoursKpiCard variante="en-linea" icon={Icon} label={label} value={String(value)} isLoading={isLoading} />;
}

function PostulacionSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4">
          <div className="flex gap-4">
            <Skeleton className="size-12 rounded-full bg-surface-container-high" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-40 rounded bg-surface-container-high" />
              <Skeleton className="h-4 w-64 rounded bg-surface-container-high" />
              <Skeleton className="h-12 w-full rounded bg-surface-container-high" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectPendingPostulationsPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const volverAMiembrosHref = `/dashboard/proyectos/${id}/miembros`;

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const cargandoPermisos = cargandoProyecto || cargandoUsuario;

  const { postulaciones, isLoading, isError, error, refetch } = useProjectPendingPostulations(idProyecto);
  const resolver = useResolvePostulacion(idProyecto);

  const rolesConSolicitudes = new Set(postulaciones.map((p) => p.rolProyecto.idRolProyecto)).size;
  const postulantesUnicos = new Set(postulaciones.map((p) => p.postulante.idUsuario)).size;
  const cargandoDatos = isLoading || cargandoPermisos;

  async function pedirConfirmacion(postulacion: PostulacionRecibida, accion: Accion) {
    const { nombre, apellido } = postulacion.postulante;
    const nombrePostulante = `${nombre} ${apellido}`;
    const confirmado = await confirmar({
      titulo: accion === 'ACEPTADA' ? `¿Aceptar la postulación de ${nombrePostulante}?` : `¿Rechazar la postulación de ${nombrePostulante}?`,
      descripcion:
        accion === 'ACEPTADA'
          ? `${nombrePostulante} se une al proyecto en el rol solicitado.`
          : `${nombrePostulante} no se une al proyecto en el rol solicitado.`,
      textoAccion: accion === 'ACEPTADA' ? 'Aceptar postulación' : 'Rechazar postulación',
      destructiva: accion === 'RECHAZADA',
    });
    if (!confirmado) return;

    resolver.mutate(
      { postulacionId: postulacion.idPostulacion, estadoPostulacion: accion },
      {
        onSuccess: () => {
          aviso.exito(
            accion === 'ACEPTADA' ? 'Nueva miembro activa' : 'Postulación rechazada',
            accion === 'ACEPTADA'
              ? `${nombrePostulante} ya es parte del equipo y aparece en la lista de miembros activos.`
              : undefined,
          );
        },
        onError: (mutationError: any) =>
          aviso.error('No se pudo resolver la postulación', mutationError?.message),
      },
    );
  }

  return (
    <ProjectPageShell>
      {!cargandoPermisos && !isLeader ? (
        <>
          <ProjectBackLink href={volverAMiembrosHref} label="Volver a miembros" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder a las postulaciones pendientes de este proyecto." />
        </>
      ) : (
        <>
          <ProjectPageHeader
            back={{ href: volverAMiembrosHref, label: 'Volver a miembros' }}
            title="Postulaciones pendientes"
            description="Personas que han solicitado unirse a roles de este proyecto y están esperando una resolución."
          />

          <section aria-label="Resumen de postulaciones" className="mb-6 grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={Clock3}
              label="Postulaciones pendientes"
              value={postulaciones.length}
              isLoading={cargandoDatos}
            />
            <MetricCard
              icon={BriefcaseBusiness}
              label="Roles con solicitudes"
              value={rolesConSolicitudes}
              isLoading={cargandoDatos}
            />
            <MetricCard
              icon={Users}
              label="Postulantes únicos"
              value={postulantesUnicos}
              isLoading={cargandoDatos}
            />
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="font-headline text-xl font-extrabold text-on-surface">Postulaciones recibidas</h2>
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-tertiary">
                {isLoading ? 'Cargando' : `${postulaciones.length} pendientes`}
              </span>
            </div>

            {isLoading || cargandoPermisos ? (
              <PostulacionSkeleton />
            ) : isError ? (
              <Empty tone="danger" role="alert">
                <EmptyMedia variant="icon">
                  <AlertCircle aria-hidden="true" className="h-7 w-7" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>
                    {getApiErrorMessage(error, 'general', 'No fue posible cargar las postulaciones.')}
                  </EmptyTitle>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => refetch()} className="rounded-xl font-bold">
                    Reintentar
                  </Button>
                </EmptyContent>
              </Empty>
            ) : postulaciones.length === 0 ? (
              <Empty tone="flush" role="status">
                <EmptyMedia variant="subtle">
                  <UserRoundPlus aria-hidden="true" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No hay postulaciones pendientes.</EmptyTitle>
                  <EmptyDescription>
                    Cuando alguien solicite unirse a un rol de este proyecto, aparecerá aquí para su revisión.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-3">
                {postulaciones.map((postulacion) => {
                  const nombreCompleto = `${postulacion.postulante.nombre} ${postulacion.postulante.apellido}`;
                  const enCurso =
                    resolver.isPending && resolver.variables?.postulacionId === postulacion.idPostulacion;

                  return (
                    <li
                      key={postulacion.idPostulacion}
                      className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4"
                    >
                      <article className="grid gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.4fr)_auto] lg:items-start">
                        <div className="flex items-center gap-4">
                          <Avatar className="size-12 shrink-0">
                            <AvatarFallback className="bg-primary-container text-base font-bold text-on-primary-container">
                              {getInitials(postulacion.postulante.nombre, postulacion.postulante.apellido)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-extrabold text-on-surface">{nombreCompleto}</h3>
                            <p className="truncate text-sm text-tertiary">{postulacion.postulante.correo}</p>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-tertiary">Rol solicitado</span>
                            <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">
                              {postulacion.rolProyecto.nombreRol}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-on-surface-variant">
                            {postulacion.justificacion || 'Sin justificación registrada.'}
                          </p>
                          <p className="flex items-center gap-2 text-xs text-tertiary">
                            <Calendar aria-hidden="true" className="h-4 w-4" />
                            Solicitada el {formatFecha(postulacion.fechaPostulacion)}
                          </p>
                        </div>

                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between lg:min-w-[13rem] lg:flex-col lg:items-end">
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            PENDIENTE
                          </span>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void pedirConfirmacion(postulacion, 'RECHAZADA')}
                              disabled={enCurso}
                              aria-label={`Rechazar postulación de ${nombreCompleto}`}
                              className="border-error px-4 font-bold text-error hover:bg-error-container"
                            >
                              Rechazar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => void pedirConfirmacion(postulacion, 'ACEPTADA')}
                              disabled={enCurso}
                              aria-label={`Aceptar postulación de ${nombreCompleto}`}
                              className="px-4 font-bold text-on-primary"
                            >
                              Aceptar
                            </Button>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

    </ProjectPageShell>
  );
}
