'use client';

import { NotificationInbox } from '@/components/notifications/notification-inbox';

/**
 * Sprint 10: centro de notificaciones como bandeja institucional (carpetas,
 * lista compacta y visor). Misma estructura que el workspace del proyecto
 * (`projects/[id]/layout.tsx`): una fila a la altura de la ventana menos la
 * cabecera (4 rem) y, en móvil, la barra inferior (5 rem), sin el contenedor
 * compartido de 1400 px ni gutters: la sidebar secundaria va pegada a la
 * global y la bandeja y el visor llegan hasta el borde derecho.
 */
export default function NotificacionesPage() {
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-0 md:h-[calc(100dvh-4rem)]">
      <NotificationInbox />
    </div>
  );
}
