'use client';

import { useState } from 'react';
import { AlertCircle, ChevronRight, UserRoundPlus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import uvgSwal from '@/lib/swal';
import { useProjectPendingPostulations, useResolvePostulacion } from '@/hooks/use-project-pending-postulations';
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
  return new Date(fechaIso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * F13 — tarjeta "Postulaciones pendientes" dentro de `/miembros`. Lee B13
 * (`useProjectPendingPostulations`, `GET /proyectos/:id/miembros/postulaciones-pendientes`)
 * y resuelve con el endpoint YA EXISTENTE de `applications/`
 * (`useResolvePostulacion`, `PATCH /postulaciones/:id/estado`). No mantiene
 * ninguna copia local permanente de las postulaciones: tras Aceptar/Rechazar
 * (éxito o error) la mutation invalida `pending-postulations` y reconcilia
 * con el servidor — el contador y el listado nunca se editan a mano.
 *
 * Query independiente de `useProjectTeam`: un error aquí no debe tumbar las
 * tres secciones de F12, que siguen renderizándose con su propio estado.
 */
export function PendingPostulationsCard({ idProyecto }: { idProyecto: number }) {
  const { postulaciones, isLoading, isError, refetch } = useProjectPendingPostulations(idProyecto);
  const resolver = useResolvePostulacion(idProyecto);

  const [expanded, setExpanded] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const panelId = 'postulaciones-pendientes-panel';
  const contador = isError ? 'Error' : isLoading ? null : String(postulaciones.length);

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
          uvgSwal.fire({
            icon: 'success',
            title: accion === 'ACEPTADA' ? 'Postulación aceptada' : 'Postulación rechazada',
            timer: 2000,
          });
        },
        onError: (error: any) => {
          setConfirmTarget(null);
          uvgSwal.fire({
            icon: 'error',
            title: 'No se pudo resolver la postulación',
            text: error?.message || 'Ocurrió un error inesperado.',
          });
        },
      },
    );
  }

  const nombrePostulante = confirmTarget
    ? `${confirmTarget.postulacion.postulante.nombre} ${confirmTarget.postulacion.postulante.apellido}`
    : '';

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setExpanded((valor) => !valor)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <UserRoundPlus aria-hidden="true" className="w-5 h-5 text-on-primary-container" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-tertiary uppercase tracking-wide whitespace-nowrap">
            Postulaciones pendientes
          </p>
          {contador === null ? (
            <Skeleton className="h-7 w-8 rounded mt-1 bg-surface-container-high" />
          ) : (
            <p className={`text-2xl font-headline font-extrabold ${isError ? 'text-error' : 'text-on-surface'}`}>
              {contador}
            </p>
          )}
        </div>
        <ChevronRight
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div id={panelId} className="mt-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl bg-surface-container-high" />
              <Skeleton className="h-16 w-full rounded-xl bg-surface-container-high" />
            </div>
          ) : isError ? (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-6 w-6" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No fue posible cargar las postulaciones.</EmptyTitle>
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
          ) : postulaciones.length === 0 ? (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <UserRoundPlus aria-hidden="true" className="h-6 w-6" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No hay postulaciones pendientes.</EmptyTitle>
                <EmptyDescription>
                  Cuando alguien se postule a un rol de este proyecto, aparecerá aquí.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {postulaciones.map((postulacion) => {
                const nombreCompleto = `${postulacion.postulante.nombre} ${postulacion.postulante.apellido}`;
                const enCurso = resolver.isPending && resolver.variables?.postulacionId === postulacion.idPostulacion;

                return (
                  <li
                    key={postulacion.idPostulacion}
                    className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-primary-container text-xs font-bold text-on-primary-container">
                          {getInitials(postulacion.postulante.nombre, postulacion.postulante.apellido)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-on-surface">{nombreCompleto}</p>
                        <p className="text-xs text-tertiary">{postulacion.rolProyecto.nombreRol}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
                          {postulacion.justificacion}
                        </p>
                        <p className="mt-1 text-[11px] text-tertiary">
                          Enviada el {formatFecha(postulacion.fechaPostulacion)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => pedirConfirmacion(postulacion, 'RECHAZADA')}
                        disabled={enCurso}
                        aria-label={`Rechazar postulación de ${nombreCompleto}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => pedirConfirmacion(postulacion, 'ACEPTADA')}
                        disabled={enCurso}
                        aria-label={`Aceptar postulación de ${nombreCompleto}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        Aceptar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
