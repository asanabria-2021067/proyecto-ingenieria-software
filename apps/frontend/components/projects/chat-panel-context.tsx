'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Puente mínimo entre cualquier vista del proyecto (p. ej. la ficha del
 * líder en "Resumen") y el panel de chat, que vive en el sidebar y no
 * comparte estado con sus hermanos. `requestChatWith` solo deja la
 * intención ("abrí/creá un chat individual con este usuario"); quien
 * realmente sabe crear/abrir la conversación es ProjectChatPanel.
 */
interface ChatPanelContextValue {
  pendingChatUserId: number | null;
  requestChatWith: (idUsuario: number) => void;
  clearPendingChat: () => void;
}

// Sin Provider (p. ej. un test que monta la página sin el layout del
// proyecto), requestChatWith queda como no-op en vez de reventar: el botón
// de chat simplemente no hace nada, el resto de la página sigue funcionando.
const noopContextValue: ChatPanelContextValue = {
  pendingChatUserId: null,
  requestChatWith: () => {},
  clearPendingChat: () => {},
};

const ChatPanelContext = createContext<ChatPanelContextValue>(noopContextValue);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [pendingChatUserId, setPendingChatUserId] = useState<number | null>(null);

  return (
    <ChatPanelContext.Provider
      value={{
        pendingChatUserId,
        requestChatWith: setPendingChatUserId,
        clearPendingChat: () => setPendingChatUserId(null),
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelContext);
}
