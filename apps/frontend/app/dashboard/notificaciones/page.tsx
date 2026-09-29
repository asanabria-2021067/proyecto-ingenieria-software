'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Award,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  Flag,
  FolderKanban,
  KeyRound,
  MessageSquare,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import uvgSwal from '@/lib/swal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  getNotificationLink,
  type Notificacion,
} from '@/lib/services/notifications';
import { resolveTaskNotificationLink } from '@/components/notifications/task-notification-link';
import { dashboardPage } from '@/components/layout/dashboard-page';

/** Heurística por palabra clave del tipo (30+ valores en TipoNotificacion):
 * evita mantener un mapa exhaustivo que se desactualiza con cada tipo nuevo. */
const TYPE_ICON_RULES: Array<[string, typeof Bell]> = [
  ['POSTULACION', UserCheck],
  ['TAREA', ClipboardList],
  ['HITO', Flag],
  ['CIERRE', FolderKanban],
  ['PROYECTO', FolderKanban],
  ['HORAS', Clock3],
  ['CERTIFICADO', Award],
  ['COMENTARIO', MessageSquare],
  ['MENSAJE', MessageSquare],
  ['AMISTAD', UserPlus],
  ['SEGUIDOR', UserPlus],
  ['LIDERAZGO', Users],
  ['APELACION', Users],
  ['ROL_', Users],
  ['ALERTA_SEGURIDAD', ShieldAlert],
  ['RECUPERACION', KeyRound],
  ['EVENTO', CalendarClock],
];

function getNotifIcon(tipo: string): typeof Bell {
  return TYPE_ICON_RULES.find(([key]) => tipo.includes(key))?.[1] ?? Bell;
}

function humanizeTipo(tipo: string): string {
  const lower = tipo.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function NotificacionesSkeleton() {
  return (
    <div className="flex flex-col gap-stack" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-base flex items-start gap-stack">
          <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificacionesPage() {
  const queryClient = useQueryClient();

  const { data: notificaciones = [], isLoading, isError, refetch } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones'],
    queryFn: getNotificaciones,
    refetchOnMount: 'always',
  });

  const markAllMutation = useMutation({
    mutationFn: marcarTodasLeidas,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'conteo'] });
      uvgSwal.fire({
        icon: 'success',
        title: 'Listo',
        text: 'Todas las notificaciones fueron marcadas como leídas',
        timer: 2000,
      });
    },
    onError: () => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron marcar las notificaciones',
      });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: marcarLeida,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'conteo'] });
    },
  });

  const groupByDate = (notifs: Notificacion[]) => {
    const groups: Record<string, Notificacion[]> = {};
    notifs.forEach((n) => {
      const fecha = new Date(n.creadaEn).toLocaleDateString('es-GT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[fecha]) groups[fecha] = [];
      groups[fecha].push(n);
    });
    return groups;
  };

  const grouped = groupByDate(notificaciones);
  const unreadCount = notificaciones.filter((n) => !n.leidaEn).length;

  return (
      <div className={dashboardPage('py-section flex flex-col gap-section')}>
        <div className="flex flex-col gap-stack lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-stack">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container/15 text-primary">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-tight">
                <h1 className="type-display">Notificaciones</h1>
                {unreadCount > 0 && (
                  <span className="pill pill-accent">
                    {unreadCount} nueva{unreadCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="type-meta mt-micro">
                Entérate de postulaciones, revisiones de horas y avisos de tus proyectos.
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              aria-label="Marcar todas las notificaciones como leidas"
              className="self-start rounded-full bg-primary text-on-primary hover:bg-primary/90 lg:self-center"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todas como leídas
            </Button>
          )}
        </div>

        {isLoading && <NotificacionesSkeleton />}

        {isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar las notificaciones</EmptyTitle>
              <EmptyDescription>
                Intenta nuevamente para revisar avisos recientes y cambios en tus postulaciones.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => refetch()} className="rounded-full bg-primary text-on-primary hover:bg-primary/90">
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && notificaciones.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <BellOff aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Todo esta al dia</EmptyTitle>
              <EmptyDescription>
                Las alertas de postulaciones, revisiones y avances apareceran aqui cuando haya actividad nueva.
              </EmptyDescription>
            </EmptyHeader>
            <EmptySteps />
          </Empty>
        )}

        {!isLoading && !isError && notificaciones.length > 0 && (
        <div className="flex flex-col gap-section">
          {Object.entries(grouped).map(([fecha, notifs], groupIndex) => (
            <div
              key={fecha}
              className="surface-enter flex flex-col gap-stack"
              style={{ animationDelay: `${Math.min(groupIndex, 8) * 45}ms` }}
            >
              <div className="flex items-center justify-between px-tight">
                <div className="flex items-center gap-tight">
                  <span className="h-2 w-2 rounded-full bg-outline-variant" aria-hidden="true" />
                  <h2 className="type-meta font-bold uppercase tracking-wider text-text-secondary">
                    {fecha}
                  </h2>
                </div>
                <span className="type-meta text-text-secondary/80">
                  {notifs.length} aviso{notifs.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-col gap-tight">
                {notifs.map((n) => {
                  const href = getNotificationLink(n) ?? resolveTaskNotificationLink(n);
                  const Icon = getNotifIcon(n.tipoNotificacion);
                  const cardClassName = `card-base flex items-start gap-stack transition-all ${
                    n.leidaEn ? '' : 'border-primary/30 bg-primary-container/5 shadow-sm'
                  } ${href ? 'cursor-pointer hover:shadow-raised' : ''}`;

                  const card = (
                    <>
                      <div
                        className={`relative shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl ${
                          n.leidaEn ? 'bg-surface-container text-tertiary' : 'bg-primary-container/15 text-primary'
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                        {!n.leidaEn && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface-container-lowest"
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-tight">
                          <h3 className="type-subtitle font-bold text-text-primary">
                            {n.tituloNotificacion}
                          </h3>
                          <span className="pill pill-neutral">{humanizeTipo(n.tipoNotificacion)}</span>
                          <span className="type-meta">
                            ·{' '}
                            {new Date(n.creadaEn).toLocaleString('es-GT', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {n.mensajeNotificacion && (
                          <p className="type-body mt-micro">{n.mensajeNotificacion}</p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-tight self-start">
                        {!n.leidaEn && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markOneMutation.mutate(n.idNotificacion);
                            }}
                            disabled={markOneMutation.isPending}
                            aria-label={`Marcar como leida la notificacion ${n.tituloNotificacion}`}
                            className="shrink-0 rounded-lg p-2 text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
                            title="Marcar como leída"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        {href && (
                          <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                        )}
                      </div>
                    </>
                  );

                  if (href) {
                    return (
                      <Link
                        key={n.idNotificacion}
                        href={href}
                        onClick={() => {
                          if (!n.leidaEn) markOneMutation.mutate(n.idNotificacion);
                        }}
                        className={cardClassName}
                      >
                        {card}
                      </Link>
                    );
                  }

                  return (
                    <div key={n.idNotificacion} className={cardClassName}>
                      {card}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
  );
}
