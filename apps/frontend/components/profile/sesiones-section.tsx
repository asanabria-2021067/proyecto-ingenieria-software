'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, LogOut, Monitor } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { cerrarOtrasSesiones, cerrarSesionAbierta, getSesiones, sesionesQueryKey } from '@/lib/services/cuenta';
import { aviso } from '@/lib/mensajes';

const FORMATO_FECHA = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

function fechaUso(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? 'Sin fecha' : FORMATO_FECHA.format(fecha);
}

/** MEJ-81: sesiones abiertas de la cuenta, con cierre individual y «Cerrar todas las demás». */
export function SesionesSection() {
  const queryClient = useQueryClient();
  const [confirmarOtras, setConfirmarOtras] = useState(false);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: sesionesQueryKey,
    queryFn: getSesiones,
    retry: false,
  });

  const alFallar = (error: Error) =>
    aviso.error('No se pudo cerrar la sesión', getApiErrorMessage(error, 'general', 'Intenta de nuevo en unos segundos.'));
  const refrescar = () => queryClient.invalidateQueries({ queryKey: sesionesQueryKey });

  const cerrar = useMutation({
    mutationFn: (idSesion: string) => cerrarSesionAbierta(idSesion),
    onSuccess: () => aviso.exito('Sesión cerrada'),
    onError: alFallar,
    onSettled: refrescar,
  });
  const cerrarOtras = useMutation({
    mutationFn: cerrarOtrasSesiones,
    onSuccess: ({ cerradas }) =>
      aviso.exito(cerradas === 1 ? 'Se cerró 1 sesión' : `Se cerraron ${cerradas} sesiones`),
    onError: alFallar,
    onSettled: () => {
      setConfirmarOtras(false);
      void refrescar();
    },
  });

  const sesiones = data ?? [];
  const hayOtras = sesiones.some((s) => !s.actual);
  const ocupado = cerrar.isPending || cerrarOtras.isPending;

  return (
    <section id="sesiones" aria-labelledby="sesiones-titulo" className="card-base scroll-mt-24 p-card">
      <div className="flex flex-wrap items-start justify-between gap-stack">
        <div>
          <h2 id="sesiones-titulo" className="type-section">
            Sesiones abiertas
          </h2>
          <p className="type-body mt-tight max-w-2xl text-text-secondary">
            Dispositivos donde tu cuenta tiene la sesión iniciada. Cierra los que no reconozcas.
          </p>
        </div>
        {hayOtras && (
          <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => setConfirmarOtras(true)}>
            <LogOut aria-hidden="true" />
            Cerrar todas las demás
          </Button>
        )}
      </div>

      <div className="mt-stack">
        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus sesiones.</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isLoading ? (
          <SkeletonRegion label="Cargando sesiones abiertas" className="space-y-inline">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </SkeletonRegion>
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {sesiones.map((s) => (
              <li key={s.idSesion} className="flex flex-wrap items-center gap-x-stack gap-y-tight py-inline">
                <Monitor className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="type-body break-words font-semibold text-text-primary">
                    {s.navegador} en {s.sistema}
                  </p>
                  <p className="type-meta">Último uso: {fechaUso(s.ultimoUso)}</p>
                </div>
                {s.actual ? (
                  <Tag tone="success">Sesión actual</Tag>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    aria-label={`Cerrar la sesión de ${s.navegador} en ${s.sistema}`}
                    onClick={() => cerrar.mutate(s.idSesion)}
                  >
                    Cerrar sesión
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmarOtras && (
        <ConfirmActionDialog
          open
          title="Cerrar todas las demás sesiones"
          description="Se cerrará la sesión en todos los dispositivos, menos en este. Tendrán que iniciar sesión de nuevo."
          actionLabel="Cerrar sesiones"
          variant="destructive"
          isPending={cerrarOtras.isPending}
          onConfirm={() => cerrarOtras.mutate()}
          onCancel={() => setConfirmarOtras(false)}
        />
      )}
    </section>
  );
}
