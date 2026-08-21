'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, BriefcaseBusiness, Calendar, Clock3, UserRoundPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectPendingPostulations, useResolvePostulacion } from '@/hooks/use-project-pending-postulations';
import uvgSwal from '@/lib/swal';
import type { PostulacionRecibida } from '@/types';

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
  icon: typeof Clock3;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-5 py-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <Icon aria-hidden="true" className="h-6 w-6 text-on-primary-container" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-tertiary">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-10 rounded bg-surface-container-high" />
          ) : (
            <p className="mt-1 font-headline text-3xl font-extrabold text-on-surface">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
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
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const rolesConSolicitudes = new Set(postulaciones.map((p) => p.rolProyecto.idRolProyecto)).size;
  const postulantesUnicos = new Set(postulaciones.map((p) => p.postulante.idUsuario)).size;
  const cargandoDatos = isLoading || cargandoPermisos;

  function pedirConfirmacion(postulacion: PostulacionRecibida, accion: Accion) {
    setConfirmTarget({ postulacion, accion });
  }

  function cancelarConfirmacion() {
    if (resolver.isPending) return;
    setConfirmTarget(null);
  }

  function confirmar() {
    if (!confirmTarget) return;
    const { postulacion, accion } = confirmTarget;

    resolver.mutate(
      { postulacionId: postulacion.idPostulacion, estadoPostulacion: accion },
      {
        onSuccess: () => {
          setConfirmTarget(null);
          const { nombre, apellido } = postulacion.postulante;
          uvgSwal.fire({
            icon: 'success',
            title: accion === 'ACEPTADA' ? 'Nueva miembro activa' : 'Postulación rechazada',
            text:
              accion === 'ACEPTADA'
                ? `${nombre} ${apellido} ya es parte del equipo y aparece en la lista de miembros activos.`
                : undefined,
            timer: 2200,
          });
        },
        onError: (mutationError: any) => {
          setConfirmTarget(null);
          uvgSwal.fire({
            icon: 'error',
            title: 'No se pudo resolver la postulación',
            text: mutationError?.message || 'Ocurrió un error inesperado.',
          });
        },
      },
    );
  }

  const nombrePostulante = confirmTarget
    ? `${confirmTarget.postulacion.postulante.nombre} ${confirmTarget.postulacion.postulante.apellido}`
    : '';

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={volverAMiembrosHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a miembros
      </Link>

      {!cargandoPermisos && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder a las postulaciones pendientes de este proyecto." />
      ) : (
        <>
          <header className="mb-8">
            <div className="mb-2 flex items-center gap-3">
              <UserRoundPlus aria-hidden="true" className="h-7 w-7 text-primary" />
              <h1 className="font-headline text-3xl font-extrabold text-on-surface">
                Postulaciones pendientes
              </h1>
            </div>
            <p className="max-w-3xl text-sm text-tertiary">
              Personas que han solicitado unirse a roles de este proyecto y están esperando una resolución.
            </p>
          </header>

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
                    {error instanceof Error && error.message
                      ? error.message
                      : 'No fue posible cargar las postulaciones.'}
                  </EmptyTitle>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => refetch()} className="rounded-xl font-bold">
                    Reintentar
                  </Button>
                </EmptyContent>
              </Empty>
            ) : postulaciones.length === 0 ? (
              <Empty tone="muted" role="status">
                <EmptyMedia variant="icon">
                  <UserRoundPlus aria-hidden="true" className="h-7 w-7" />
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
                              onClick={() => pedirConfirmacion(postulacion, 'RECHAZADA')}
                              disabled={enCurso}
                              aria-label={`Rechazar postulación de ${nombreCompleto}`}
                              className="border-error px-4 font-bold text-error hover:bg-error-container"
                            >
                              Rechazar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => pedirConfirmacion(postulacion, 'ACEPTADA')}
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

      <ConfirmActionDialog
        open={confirmTarget !== null}
        title={confirmTarget?.accion === 'ACEPTADA' ? 'Aceptar postulación' : 'Rechazar postulación'}
        description={
          confirmTarget?.accion === 'ACEPTADA'
            ? `¿Confirmas que deseas aceptar la postulación de ${nombrePostulante}?`
            : `¿Confirmas que deseas rechazar la postulación de ${nombrePostulante}?`
        }
        actionLabel={confirmTarget?.accion === 'ACEPTADA' ? 'Sí, aceptar postulación' : 'Sí, rechazar postulación'}
        variant={confirmTarget?.accion === 'RECHAZADA' ? 'destructive' : 'default'}
        isPending={resolver.isPending}
        onConfirm={confirmar}
        onCancel={cancelarConfirmacion}
      />
    </div>
  );
}
