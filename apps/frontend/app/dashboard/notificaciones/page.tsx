'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bell, BellOff, Check, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/components/admin/AdminLayout';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import uvgSwal from '@/lib/swal';
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

export default function NotificacionesPage() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();

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

  if (userLoading) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const Layout = isAdminUser(currentUser) ? AdminLayout : DashboardLayout;

  return (
    <Layout>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-6 h-6 text-primary" />
              <h1 className="font-headline font-extrabold text-3xl text-on-surface">
                Notificaciones
              </h1>
            </div>
            <p className="text-tertiary text-sm">
              {unreadCount > 0
                ? `Tienes ${unreadCount} notificación${unreadCount !== 1 ? 'es' : ''} sin leer`
                : 'No tienes notificaciones sin leer'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              aria-label="Marcar todas las notificaciones como leidas"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Marcar todas como leídas
            </button>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm" role="status">
            Cargando notificaciones...
          </div>
        )}

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
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Reintentar
              </button>
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

        <div className="space-y-6">
          {Object.entries(grouped).map(([fecha, notifs], groupIndex) => (
            <div
              key={fecha}
              className="surface-enter"
              style={{ animationDelay: `${Math.min(groupIndex, 8) * 45}ms` }}
            >
              <h2 className="font-headline font-bold text-sm text-tertiary uppercase tracking-wider mb-3">
                {fecha}
              </h2>
              <div className="space-y-3">
                {notifs.map((n) => {
                  const href = getNotificationLink(n) ?? resolveTaskNotificationLink(n);
                  const cardClassName = `relative rounded-2xl border p-5 transition-all ${
                    n.leidaEn
                      ? 'bg-surface-container-lowest border-outline-variant'
                      : 'bg-primary-container/10 border-primary/30 shadow-sm'
                  } ${href ? 'cursor-pointer hover:shadow-md' : ''}`;

                  const card = (
                    <div className="flex items-start gap-4">
                      <div
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          n.leidaEn ? 'bg-surface-container' : 'bg-primary'
                        }`}
                      >
                        <Bell
                          className={`w-5 h-5 ${n.leidaEn ? 'text-tertiary' : 'text-on-primary'}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-headline font-bold text-on-surface text-base mb-1">
                          {n.tituloNotificacion}
                        </h3>
                        {n.mensajeNotificacion && (
                          <p className="text-on-surface text-sm leading-relaxed mb-2">
                            {n.mensajeNotificacion}
                          </p>
                        )}
                        <p className="text-xs text-tertiary">
                          {new Date(n.creadaEn).toLocaleString('es-GT', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
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
                          className="shrink-0 p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50"
                          title="Marcar como leída"
                        >
                          <Check className="w-4 h-4 text-primary" />
                        </button>
                      )}
                    </div>
                  );

                  if (href) {
                    return (
                      <Link
                        key={n.idNotificacion}
                        href={href}
                        onClick={() => {
                          if (!n.leidaEn) markOneMutation.mutate(n.idNotificacion);
                        }}
                        className={`block ${cardClassName}`}
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
      </div>
    </Layout>
  );
}
