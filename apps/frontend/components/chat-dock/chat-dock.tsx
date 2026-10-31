'use client';

import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { ChatListLauncher } from '@/components/chat-dock/chat-list-launcher';
import { ChatWindow } from '@/components/chat-dock/chat-window';
import { useGlobalChatSocket } from '@/hooks/use-chat';

/**
 * Dock global de chat (estilo LinkedIn): ventanas de conversación fijas abajo a
 * la derecha en cualquier página del dashboard; aquí vive el socket global. El
 * punto de entrada principal es el icono de la barra superior; el botón flotante
 * «Mensajes» queda solo en pantallas angostas (sobre la barra de navegación inferior).
 */
export function ChatDock() {
  const { windows, minimizedIds, cerrarChat, toggleMinimize } = useChatDock();
  const { isConnected: chatConnected, typingByConversation, emitTyping } = useGlobalChatSocket(windows.map((w) => w.idConversacion));

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
