'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RUTA_MENSAJES, idConversacionDeRuta, useChatDock } from '@/components/chat-dock/chat-dock-context';
import { ChatListLauncher } from '@/components/chat-dock/chat-list-launcher';
import { ChatWindow } from '@/components/chat-dock/chat-window';
import { useGlobalChatSocket } from '@/hooks/use-chat';

type ChatSocket = ReturnType<typeof useGlobalChatSocket>;

const ChatSocketContext = createContext<ChatSocket>({ isConnected: false, typingByConversation: {}, emitTyping: () => {} });

/** Un solo socket de chat para el dock y la página de mensajes; se une a las ventanas abiertas y a la conversación de la página. */
export function ChatSocketProvider({ children }: { children: ReactNode }) {
  const { windows } = useChatDock();
  const idPagina = idConversacionDeRuta(usePathname());
  const ids = windows.map((w) => w.idConversacion);
  const socket = useGlobalChatSocket(idPagina && !ids.includes(idPagina) ? [...ids, idPagina] : ids);
  return <ChatSocketContext.Provider value={socket}>{children}</ChatSocketContext.Provider>;
}

export const useChatSocket = () => useContext(ChatSocketContext);

/**
 * Dock global de chat (estilo LinkedIn): ventanas de conversación fijas abajo a
 * la derecha en cualquier página del dashboard. El punto de entrada principal es
 * el icono de la barra superior, que lleva a /dashboard/mensajes; el dock queda
 * para el móvil y para abrir un chat desde un proyecto, y no se pinta dentro de
 * la propia página de mensajes.
 */
export function ChatDock() {
  const { windows, minimizedIds, cerrarChat, toggleMinimize } = useChatDock();
  const { isConnected: chatConnected, typingByConversation, emitTyping } = useChatSocket();
  const enPaginaMensajes = usePathname()?.startsWith(RUTA_MENSAJES);
  if (enPaginaMensajes) return null;

  return (
    // En móvil se apoya sobre la barra de navegación inferior (h-16) y apila el botón bajo las ventanas.
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex flex-col items-end justify-end gap-2 px-4 md:bottom-0 md:flex-row lg:px-6">
      <div className="pointer-events-auto flex items-end gap-2 overflow-x-auto pb-0">
        {windows.map((w) => (
          <ChatWindow
            key={w.idConversacion}
            idProyecto={w.idProyecto}
            idConversacion={w.idConversacion}
            minimized={minimizedIds.has(w.idConversacion)}
            onMinimize={() => toggleMinimize(w.idConversacion)}
            onClose={() => cerrarChat(w.idConversacion)}
            typingUserIds={typingByConversation[w.idConversacion]}
            onTyping={() => emitTyping(w.idConversacion)}
          />
        ))}
      </div>

      <ChatListLauncher variante="flotante" conectado={chatConnected} />
    </div>
  );
}
