'use client';

import Link from 'next/link';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useNotificaciones,
  useConteoNoLeidas,
  useMarcarLeida,
  useMarcarTodasLeidas,
} from '@/hooks/use-notifications';
import { getNotificationLink, type Notificacion } from '@/lib/services/notifications';
import { resolveTaskNotificationLink } from '@/components/notifications/task-notification-link';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} d`;
}

/** Ventana del panel flotante: solo se listan notificaciones de los últimos 2 días. */
const VENTANA_RECIENTES_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * `ahora` como parámetro con valor por defecto (en vez de leer `Date.now()`
 * directamente en el cuerpo del componente) para no violar la regla de
 * pureza de render de React — mismo patrón que `estaVencida` en
 * task-board.utils.ts.
 */
function filtrarRecientes(notificaciones: Notificacion[], ahora: number = Date.now()): Notificacion[] {
  const limite = ahora - VENTANA_RECIENTES_MS;
  return notificaciones
    .filter((n) => new Date(n.creadaEn).getTime() >= limite)
    .sort((a, b) => new Date(b.creadaEn).getTime() - new Date(a.creadaEn).getTime());
}

export function NotificationsBell({ onlyIcon = false }: { onlyIcon?: boolean }) {
  const { data: notificaciones = [] } = useNotificaciones();
  const { data: conteo } = useConteoNoLeidas();
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();

  const unread = conteo?.total ?? 0;
  const recientes = filtrarRecientes(notificaciones);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {onlyIcon ? (
          <button
            type="button"
            aria-label={
              unread > 0
                ? `Notificaciones, ${unread} sin leer`
                : 'Notificaciones, no hay pendientes'
            }
            className="relative flex items-center justify-center h-10 w-10 rounded-xl text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <div className="relative">
              <Bell className="w-5 h-5 shrink-0" />
              {unread > 0 && (
                <span
                  aria-live="polite"
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-0.5 ring-2 ring-surface-container-low"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </button>
        ) : (
          <button
            type="button"
            aria-label={
              unread > 0
                ? `Notificaciones, ${unread} sin leer`
                : 'Notificaciones, no hay pendientes'
            }
            className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container-high w-full transition-colors cursor-pointer"
          >
            <div className="relative">
              <Bell className="w-5 h-5 shrink-0" />
              {unread > 0 && (
                <span
                  aria-live="polite"
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-0.5 ring-2 ring-surface-container-low"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            Notificaciones
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        aria-label="Panel de notificaciones"
        // z-[60]: Sheet/Dialog usan z-50 para su overlay de fondo
        // (bg-black/50 fixed inset-0); si un Sheet queda montado a la vez
        // que este popover, ese overlay puede pintarse encima con el mismo
        // z-index y dejarlo atenuado e inclickeable ("Ver todas" no
        // respondía). Por encima de esa capa para no competir con ella.
        className="w-80 p-0 rounded-xl shadow-xl border border-outline-variant bg-surface-container-lowest opacity-100! z-[60] flex flex-col overflow-hidden max-h-[min(28rem,var(--radix-popover-content-available-height,28rem))]"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-outline-variant">
          <div>
            <p className="text-sm font-bold text-on-surface">Notificaciones</p>
            {unread > 0 && (
              <p className="text-xs text-tertiary">{unread} sin leer</p>
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => marcarTodas.mutate()}
              disabled={marcarTodas.isPending}
              aria-label="Marcar todas las notificaciones como leidas"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Leer todas
            </button>
          )}
        </div>

        {/* Lista */}
        <ScrollArea className="flex-1 min-h-0">
          {recientes.length === 0 ? (
            <div className="surface-enter px-4 py-10 text-center" role="status">
              <BellOff aria-hidden="true" className="w-8 h-8 text-outline mx-auto mb-2" />
              <p className="text-sm font-semibold text-on-surface">
                {notificaciones.length === 0 ? 'Sin notificaciones' : 'Nada en los últimos 2 días'}
              </p>
              <p className="mt-1 text-xs text-tertiary">
                {notificaciones.length === 0
                  ? 'Te avisaremos cuando haya actividad nueva.'
                  : 'Revisa "Ver todas" para tu historial completo.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {recientes.map((n) => {
                const isUnread = n.leidaEn === null;
                const href = getNotificationLink(n) ?? resolveTaskNotificationLink(n);

                const content = (
                  <div className="flex items-start gap-2">
                    {isUnread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={`flex-1 min-w-0 ${!isUnread ? 'pl-4' : ''}`}>
                      <p className={`text-sm ${isUnread ? 'font-semibold text-on-surface' : 'font-medium text-on-surface-variant'}`}>
                        {n.tituloNotificacion}
                      </p>
                      {n.mensajeNotificacion && (
                        <p className="text-xs text-tertiary mt-0.5 line-clamp-2">
                          {n.mensajeNotificacion}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-outline">
                          {timeAgo(n.creadaEn)}
                        </span>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              marcarLeida.mutate(n.idNotificacion);
                            }}
                            disabled={marcarLeida.isPending}
                            className="text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
                          >
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );

                const itemClassName = `px-4 py-3 transition-colors ${
                  isUnread
                    ? 'bg-primary/5 hover:bg-primary/10'
                    : 'hover:bg-surface-container-low'
                }`;

                return (
                  <li key={n.idNotificacion} className={itemClassName}>
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => {
                          if (isUnread) marcarLeida.mutate(n.idNotificacion);
                        }}
                        className="block -mx-4 -my-3 px-4 py-3"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="shrink-0 border-t border-outline-variant px-4 py-3">
          <Link
            href="/dashboard/notificaciones"
            className="block w-full rounded-lg px-3 py-2 text-center text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
