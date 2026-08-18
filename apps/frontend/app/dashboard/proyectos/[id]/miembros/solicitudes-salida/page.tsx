'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Calendar, Clock3, UserRoundX, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ExitRequestActions } from '@/components/projects/member-exit-request-actions';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectPendingExitRequests } from '@/hooks/use-exit-request';

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

function ExitRequestSkeleton() {
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

export default function ProjectPendingExitRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const volverAMiembrosHref = `/dashboard/proyectos/${id}/miembros`;

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const cargandoPermisos = cargandoProyecto || cargandoUsuario;

  const { requests, isLoading, isError, error, refetch } = useProjectPendingExitRequests(idProyecto);
  // Las solicitudes no traen nombre/correo del solicitante (Sección F14.1):
  // se asocian por idUsuario con el roster de miembros activos, mismo patrón
  // que ya usa la tabla de Miembros para el badge/acciones inline.
  const { members } = useProjectMembers(idProyecto);

  const solicitantesUnicos = new Set(requests.map((r) => r.idUsuario)).size;
  const cargandoDatos = isLoading || cargandoPermisos;

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
        <LeaderOnlyNotice description="No puedes acceder a las solicitudes de salida de este proyecto." />
      ) : (
        <>
          <header className="mb-8">
            <div className="mb-2 flex items-center gap-3">
              <UserRoundX aria-hidden="true" className="h-7 w-7 text-primary" />
              <h1 className="font-headline text-3xl font-extrabold text-on-surface">
                Solicitudes de salida
              </h1>
            </div>
            <p className="max-w-3xl text-sm text-tertiary">
              Integrantes que solicitaron salir del proyecto y están esperando tu revisión.
            </p>
          </header>

          <section aria-label="Resumen de solicitudes de salida" className="mb-6 grid gap-4 md:grid-cols-2">
            <MetricCard
              icon={Clock3}
              label="Solicitudes pendientes"
              value={requests.length}
              isLoading={cargandoDatos}
            />
            <MetricCard
              icon={Users}
              label="Solicitantes únicos"
              value={solicitantesUnicos}
              isLoading={cargandoDatos}
            />
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="font-headline text-xl font-extrabold text-on-surface">Solicitudes recibidas</h2>
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-tertiary">
                {isLoading ? 'Cargando' : `${requests.length} pendientes`}
              </span>
            </div>

            {isLoading || cargandoPermisos ? (
              <ExitRequestSkeleton />
            ) : isError ? (
              <Empty tone="danger" role="alert">
                <EmptyMedia variant="icon">
                  <AlertCircle aria-hidden="true" className="h-7 w-7" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>
                    {error instanceof Error && error.message
                      ? error.message
                      : 'No fue posible cargar las solicitudes de salida.'}
                  </EmptyTitle>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => refetch()} className="rounded-xl font-bold">
                    Reintentar
                  </Button>
                </EmptyContent>
              </Empty>
            ) : requests.length === 0 ? (
              <Empty tone="muted" role="status">
                <EmptyMedia variant="icon">
                  <UserRoundX aria-hidden="true" className="h-7 w-7" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No hay solicitudes de salida pendientes.</EmptyTitle>
                  <EmptyDescription>
                    Cuando un integrante solicite salir del proyecto, aparecerá aquí para tu revisión.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-3">
                {requests.map((request) => {
                  const miembro = members.find((m) => m.idUsuario === request.idUsuario);
                  const nombreCompleto = miembro
                    ? `${miembro.nombre} ${miembro.apellido}`
                    : `Usuario #${request.idUsuario}`;

                  return (
                    <li
                      key={request.idSolicitud}
                      className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4"
                    >
                      <article className="grid gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.4fr)_auto] lg:items-start">
                        <div className="flex items-center gap-4">
                          <Avatar className="size-12 shrink-0">
                            <AvatarFallback className="bg-primary-container text-base font-bold text-on-primary-container">
                              {miembro ? getInitials(miembro.nombre, miembro.apellido) : '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-extrabold text-on-surface">{nombreCompleto}</h3>
                            {miembro?.correo && (
                              <p className="truncate text-sm text-tertiary">{miembro.correo}</p>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 space-y-2">
                          <p className="text-sm leading-relaxed text-on-surface-variant">
                            {request.motivo || 'Sin motivo registrado.'}
                          </p>
                          <p className="flex items-center gap-2 text-xs text-tertiary">
                            <Calendar aria-hidden="true" className="h-4 w-4" />
                            Solicitada el {formatFecha(request.solicitadaEn)}
                          </p>
                        </div>

                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between lg:min-w-[13rem] lg:flex-col lg:items-end">
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            PENDIENTE
                          </span>
                          <ExitRequestActions
                            request={request}
                            idProyecto={idProyecto}
                            nombreCompleto={nombreCompleto}
                          />
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
    </div>
  );
}
