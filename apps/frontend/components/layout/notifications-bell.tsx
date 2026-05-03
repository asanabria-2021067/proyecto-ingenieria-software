'use client';

import {
  AlertCircle,
  Bell,
  CheckCheck,
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  FolderCheck,
  FolderX,
  Megaphone,
  MessageSquare,
  RefreshCw,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useNotificaciones,
  useConteoNoLeidas,
  useMarcarLeida,
  useMarcarTodasLeidas,
} from '@/hooks/use-notifications';

type NotifIcon = { icon: LucideIcon; bg: string; text: string };

const TIPO_ICON: Record<string, NotifIcon> = {
  PROYECTO_EN_REVISION:          { icon: ClipboardList, bg: 'bg-blue-100',   text: 'text-blue-600' },
  PROYECTO_APROBADO:             { icon: CheckCircle,   bg: 'bg-green-100',  text: 'text-green-600' },
  PROYECTO_OBSERVADO:            { icon: AlertCircle,   bg: 'bg-amber-100',  text: 'text-amber-600' },
  PROYECTO_PUBLICADO:            { icon: Megaphone,     bg: 'bg-green-100',  text: 'text-green-600' },
  POSTULACION_RESUELTA:          { icon: UserCheck,     bg: 'bg-green-100',  text: 'text-green-600' },
  PROYECTO_ACTUALIZADO:          { icon: RefreshCw,     bg: 'bg-blue-100',   text: 'text-blue-600' },
  SOLICITUD_CIERRE_PROYECTO:     { icon: FolderX,       bg: 'bg-orange-100', text: 'text-orange-600' },
  CIERRE_APROBADO:               { icon: FolderCheck,   bg: 'bg-green-100',  text: 'text-green-600' },
  CIERRE_RECHAZADO:              { icon: FolderX,       bg: 'bg-red-100',    text: 'text-red-600' },
  COMENTARIO_PROYECTO:           { icon: MessageSquare, bg: 'bg-purple-100', text: 'text-purple-600' },
  COMENTARIO_TAREA:              { icon: MessageSquare, bg: 'bg-purple-100', text: 'text-purple-600' },
  COMENTARIO_HITO:               { icon: MessageSquare, bg: 'bg-purple-100', text: 'text-purple-600' },
  MENSAJE_REVISION:              { icon: FileText,      bg: 'bg-blue-100',   text: 'text-blue-600' },
  PROYECTO_ADVERTENCIA_INACTIVIDAD: { icon: Clock,      bg: 'bg-amber-100',  text: 'text-amber-600' },
};

const DEFAULT_ICON: NotifIcon = { icon: Bell, bg: 'bg-gray-100', text: 'text-gray-500' };

function getIcon(tipo: string): NotifIcon {
  return TIPO_ICON[tipo] ?? DEFAULT_ICON;
}

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
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-lime-400 text-white text-[9px] font-black flex items-center justify-center px-0.5 ring-2 ring-white">
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
        className="w-80 p-0 rounded-xl shadow-xl border border-outline-variant bg-white"
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
                const { icon: Icon, bg, text } = getIcon(n.tipoNotificacion);
                return (
                  <li
                    key={n.idNotificacion}
                    className={`px-4 py-3 transition-colors ${
                      isUnread
                        ? 'bg-primary/5 hover:bg-primary/10'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                        <Icon className={`w-4 h-4 ${text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
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
