'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { groupNotificationPreferences } from '@/lib/notifications/preference-groups';
import { getNotificationPreferences } from '@/lib/services/notifications';

/** El cierre de sesión vacía la caché (`use-logout`): la clave no necesita llevar al usuario. */
export const notificationPreferencesQueryKey = ['notificaciones', 'preferencias'] as const;

/**
 * T-328 — preferencias de notificación del usuario en sesión, por tipo.
 * Sección autónoma del perfil: lee el contrato de HU-185 y lista los tipos que
 * el backend entrega, agrupados por tema.
 */
export function NotificationPreferencesSection() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: getNotificationPreferences,
    retry: false,
  });
  const grupos = groupNotificationPreferences(data ?? []);

  return (
    <section aria-labelledby="preferencias-notificacion-titulo" className="card-base p-card">
      <h2 id="preferencias-notificacion-titulo" className="type-section">
        Notificaciones
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">Los avisos que la plataforma puede enviarte, por tipo.</p>

      <div className="mt-stack">
        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus preferencias de notificación.</EmptyTitle>
              <EmptyDescription>Tus preferencias guardadas no cambiaron.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isLoading ? (
          <div role="status" aria-label="Cargando preferencias de notificación" className="space-y-stack">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-inline">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : grupos.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <BellOff aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay tipos de notificación para configurar.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-stack lg:grid-cols-2">
            {grupos.map((grupo) => (
              <section key={grupo.id} aria-labelledby={`preferencias-grupo-${grupo.id}`} className="min-w-0">
                <h3 id={`preferencias-grupo-${grupo.id}`} className="type-subtitle">
                  {grupo.titulo}
                </h3>
                <p className="type-meta">{grupo.descripcion}</p>
                <ul className="mt-inline divide-y divide-outline-variant/50 rounded-control border border-outline-variant/50">
                  {grupo.items.map((item) => (
                    <li key={item.tipo} className="flex items-start justify-between gap-stack px-stack py-inline">
                      <div className="min-w-0">
                        <p className="type-body break-words font-medium text-text-primary">{item.etiqueta}</p>
                        <p className="type-meta break-words">{item.descripcion}</p>
                      </div>
                      <span className="type-meta shrink-0">{item.activa ? 'Activada' : 'Desactivada'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
