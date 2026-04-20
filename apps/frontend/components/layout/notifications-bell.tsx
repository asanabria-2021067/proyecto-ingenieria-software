'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useNotificaciones,
  useConteoNoLeidas,
  useMarcarLeida,
  useMarcarTodasLeidas,
} from '@/hooks/use-notifications';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} d`;
}

export function NotificationsBell() {
  const { data: notificaciones = [] } = useNotificaciones();
  const { data: conteo } = useConteoNoLeidas();
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();

  const unread = conteo?.total ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container-high w-full transition-colors"
        >
          <div className="relative">
            <Bell className="w-5 h-5 shrink-0" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-0.5 ring-2 ring-surface-container-low">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          Notificaciones
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-xl shadow-xl border border-outline-variant"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
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
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Leer todas
            </button>
          )}
        </div>

        {/* Lista */}
        <ScrollArea className="max-h-96">
          {notificaciones.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="w-8 h-8 text-outline mx-auto mb-2" />
              <p className="text-sm text-tertiary">Sin notificaciones</p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {notificaciones.map((n) => {
                const isUnread = n.leidaEn === null;
                return (
                  <li
                    key={n.idNotificacion}
                    className={`px-4 py-3 transition-colors ${
                      isUnread
                        ? 'bg-primary/5 hover:bg-primary/10'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
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
                              onClick={() => marcarLeida.mutate(n.idNotificacion)}
                              disabled={marcarLeida.isPending}
                              className="text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
                            >
                              Marcar leída
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
