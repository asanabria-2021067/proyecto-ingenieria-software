'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChatListPopover } from '@/components/chat-dock/chat-list-popover';
import { idConversacionDeRuta } from '@/components/chat-dock/chat-dock-context';
import { SavedMessagesDialog } from '@/components/chat-dock/saved-messages-dialog';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Página de mensajes (estilo LinkedIn): lista de conversaciones a la izquierda y la
 * conversación abierta a pantalla completa a la derecha. En móvil se ve una sola
 * columna: la lista, o la conversación si la URL trae un id. Misma altura que la
 * bandeja de notificaciones (ventana menos cabecera y, en móvil, barra inferior).
 */
export default function MensajesLayout({ children }: { children: ReactNode }) {
  const idActiva = idConversacionDeRuta(usePathname());
  const { data: user } = useCurrentUser();
  const [guardadosAbierto, setGuardadosAbierto] = useState(false);

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-0 md:h-[calc(100dvh-4rem)]">
      <aside
        aria-label="Conversaciones"
        className={`min-h-0 w-full shrink-0 border-r border-outline-variant md:block md:w-80 lg:w-96 ${idActiva ? 'hidden' : 'block'}`}
      >
        <ChatListPopover pagina idActiva={idActiva} onClose={() => {}} onOpenSaved={() => setGuardadosAbierto(true)} />
      </aside>
      <section className={`min-h-0 min-w-0 flex-1 md:block ${idActiva ? 'block' : 'hidden'}`}>{children}</section>
      <SavedMessagesDialog open={guardadosAbierto} onOpenChange={setGuardadosAbierto} currentUserId={user?.idUsuario ?? null} />
    </div>
  );
}
