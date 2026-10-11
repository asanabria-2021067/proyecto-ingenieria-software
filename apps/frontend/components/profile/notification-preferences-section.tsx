'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { groupNotificationPreferences, type NotificationPreference } from '@/lib/notifications/preference-groups';
import { getNotificationPreferences, updateNotificationPreference } from '@/lib/services/notifications';

/** El cierre de sesión vacía la caché (`use-logout`): la clave no necesita llevar al usuario. */
export const notificationPreferencesQueryKey = ['notificaciones', 'preferencias'] as const;

/** Id del interruptor de un tipo: estable y válido como id aunque el tipo traiga caracteres inesperados. */
const switchId = (tipo: string) => `preferencia-${tipo.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/** Por qué no se guardó un cambio, en palabras de quien usa el perfil. */
function mensajeDeError(error: unknown): string {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para cambiar esta preferencia.';
  if (status === 429) return 'Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.';
  if (status === 400) return 'El servidor no reconoce este tipo de notificación. No se guardó el cambio.';
  if (status === 403) return 'No tienes permiso para cambiar esta preferencia.';
  return 'No se pudo guardar el cambio. El interruptor conserva su valor anterior.';
}

/**
 * T-328 — preferencias de notificación del usuario en sesión, por tipo.
 * Sección autónoma del perfil: lee el contrato de HU-185 y lista los tipos que
 * el backend entrega, agrupados por tema.
 *
 * Cada interruptor corresponde a UN tipo real de la respuesta: no hay
 * interruptores de grupo ni de tipos que el backend no entregue. El backend no
 * marca ningún tipo como obligatorio, así que ninguno se muestra bloqueado por
 * esa razón. El chat no tiene tipo de notificación: en vez de un interruptor
 * decorativo se explica dónde llegan sus mensajes.
 *
 * Guardado: un PUT por interruptor pulsado, sin reintentos automáticos ni
 * cambios en lote. El interruptor NO se mueve al pulsarlo: cambia cuando el
 * servidor confirma, y muestra el valor que el servidor devolvió para ese
 * tipo. Si el guardado falla conserva su valor y lo explica. Solo el
 * interruptor que se está guardando queda en espera; los demás siguen libres.
 */
export function NotificationPreferencesSection() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: getNotificationPreferences,
    retry: false,
  });
  const grupos = groupNotificationPreferences(data ?? []);
  const queryClient = useQueryClient();
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});

  const cambiar = async (tipo: string, activa: boolean) => {
    if (guardando.has(tipo)) return;
    setGuardando((actual) => new Set(actual).add(tipo));
    setErrores(({ [tipo]: _resuelto, ...resto }) => resto);
    try {
      const guardadas = await updateNotificationPreference(tipo, activa);
      const confirmada = guardadas.find((preferencia) => preferencia.tipo === tipo);
      if (!confirmada) throw new Error('la respuesta no incluye el tipo guardado');
      // Solo se actualiza ESTE tipo: la respuesta de un guardado no pisa otro que siga en curso.
      queryClient.setQueryData<NotificationPreference[]>(notificationPreferencesQueryKey, (lista) =>
        (lista ?? guardadas).map((preferencia) => (preferencia.tipo === tipo ? { tipo, activa: confirmada.activa } : preferencia)),
      );
    } catch (error) {
      setErrores((actual) => ({ ...actual, [tipo]: mensajeDeError(error) }));
    } finally {
      setGuardando((actual) => {
        const siguiente = new Set(actual);
        siguiente.delete(tipo);
        return siguiente;
      });
    }
  };

  return (
    <section aria-labelledby="preferencias-notificacion-titulo" className="card-base p-card">
      <h2 id="preferencias-notificacion-titulo" className="type-section">
        Notificaciones
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        Elige qué avisos quieres recibir. Cada cambio se guarda al momento, sin botón de guardar.
      </p>
      <p className="type-meta mt-tight max-w-2xl">
        Los mensajes de chat no se configuran aquí: llegan siempre por el chat y no generan notificaciones.
      </p>

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
                    <li key={item.tipo} className="px-stack py-inline">
                      <div className="flex items-start justify-between gap-stack">
                        <div className="min-w-0">
                          <Label htmlFor={switchId(item.tipo)} className="type-body break-words font-medium text-text-primary">
                            {item.etiqueta}
                          </Label>
                          <p id={`${switchId(item.tipo)}-descripcion`} className="type-meta break-words">
                            {item.descripcion}
                          </p>
                        </div>
                        <Switch
                          id={switchId(item.tipo)}
                          data-tipo={item.tipo}
                          checked={item.activa}
                          disabled={guardando.has(item.tipo)}
                          onCheckedChange={(activa) => void cambiar(item.tipo, activa)}
                          aria-describedby={`${switchId(item.tipo)}-descripcion`}
                          className="mt-0.5"
                        />
                      </div>
                      {guardando.has(item.tipo) && <p className="type-meta mt-tight">Guardando…</p>}
                      {errores[item.tipo] && (
                        <p role="alert" className="type-meta mt-tight text-error">
                          {errores[item.tipo]}
                        </p>
                      )}
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
