'use client';

import { dashboardPage } from '@/components/layout/dashboard-page';
import { NotificationInbox } from '@/components/notifications/notification-inbox';

/**
 * Sprint 10: centro de notificaciones como bandeja institucional (carpetas,
 * lista compacta y visor). Ocupa la altura de la ventana menos la cabecera
 * (4 rem) y, en móvil, también la barra inferior (5 rem): los paneles hacen
 * scroll por dentro, como el workspace del proyecto.
 */
export default function NotificacionesPage() {
  return (
    <div className={dashboardPage('flex h-[calc(100dvh-9rem)] min-h-0 flex-col gap-stack py-stack md:h-[calc(100dvh-4rem)] md:py-section')}>
      <NotificationInbox />
    </div>
  );
}
