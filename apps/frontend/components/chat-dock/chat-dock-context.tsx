'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createConversation } from '@/lib/services/chat';
import { allConversationsQueryKey, projectConversationsQueryKey } from '@/lib/query-keys/chat';

export interface ChatDockWindow {
  idProyecto: number;
  idConversacion: number;
}

interface ChatDockContextValue {
  windows: ChatDockWindow[];
  minimizedIds: ReadonlySet<number>;
  abrirChat: (idProyecto: number, idConversacion: number) => void;
  cerrarChat: (idConversacion: number) => void;
  toggleMinimize: (idConversacion: number) => void;
  /** Crea (o reutiliza, si ya existe) una conversación individual y la abre. */
  iniciarChatCon: (idProyecto: number, idUsuario: number) => Promise<void>;
}

// Sin Provider (p. ej. un test que monta una página suelta), estas funciones
// quedan como no-op en vez de reventar: el botón de chat simplemente no
// abre nada, el resto de la página sigue funcionando.
const noopContextValue: ChatDockContextValue = {
  windows: [],
  minimizedIds: new Set(),
  abrirChat: () => {},
  cerrarChat: () => {},
  toggleMinimize: () => {},
  iniciarChatCon: async () => {},
};

const ChatDockContext = createContext<ChatDockContextValue>(noopContextValue);

/** LinkedIn permite 3 chats expandidos a la vez; el resto se minimiza solo. */
const MAX_EXPANDIDOS = 3;
/** Tope total (expandidos + minimizados) para no acumular ventanas para siempre. */
const MAX_VENTANAS = 6;

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [windows, setWindows] = useState<ChatDockWindow[]>([]);
  const [minimizedIds, setMinimizedIds] = useState<Set<number>>(new Set());

  const minimizarElMasAntiguoExpandido = useCallback(
    (actuales: ChatDockWindow[], minimizados: Set<number>) => {
      const masAntiguoExpandido = actuales.find((w) => !minimizados.has(w.idConversacion));
      if (!masAntiguoExpandido) return minimizados;
      const siguiente = new Set(minimizados);
      siguiente.add(masAntiguoExpandido.idConversacion);
      return siguiente;
    },
    [],
  );

  const abrirChat = useCallback(
    (idProyecto: number, idConversacion: number) => {
      setWindows((actuales) => {
        const yaAbierta = actuales.some((w) => w.idConversacion === idConversacion);
        const sinEsta = actuales.filter((w) => w.idConversacion !== idConversacion);
        const siguiente = [...sinEsta, { idProyecto, idConversacion }];
        return siguiente.length > MAX_VENTANAS ? siguiente.slice(siguiente.length - MAX_VENTANAS) : siguiente;
      });
      setMinimizedIds((actuales) => {
        let siguiente = new Set(actuales);
        siguiente.delete(idConversacion);
        const expandidas = windows.filter((w) => w.idConversacion !== idConversacion && !siguiente.has(w.idConversacion));
        if (expandidas.length >= MAX_EXPANDIDOS) {
          siguiente = minimizarElMasAntiguoExpandido(expandidas, siguiente);
        }
        return siguiente;
      });
    },
    [windows, minimizarElMasAntiguoExpandido],
  );

  const cerrarChat = useCallback((idConversacion: number) => {
    setWindows((actuales) => actuales.filter((w) => w.idConversacion !== idConversacion));
    setMinimizedIds((actuales) => {
      if (!actuales.has(idConversacion)) return actuales;
      const siguiente = new Set(actuales);
      siguiente.delete(idConversacion);
      return siguiente;
    });
  }, []);

  const toggleMinimize = useCallback(
    (idConversacion: number) => {
      setMinimizedIds((actuales) => {
        const siguiente = new Set(actuales);
        if (siguiente.has(idConversacion)) {
          siguiente.delete(idConversacion);
          const expandidas = windows.filter((w) => w.idConversacion !== idConversacion && !siguiente.has(w.idConversacion));
          if (expandidas.length >= MAX_EXPANDIDOS) {
            return minimizarElMasAntiguoExpandido(expandidas, siguiente);
          }
          return siguiente;
        }
        siguiente.add(idConversacion);
        return siguiente;
      });
    },
    [windows, minimizarElMasAntiguoExpandido],
  );

  const iniciarChatCon = useCallback(
    async (idProyecto: number, idUsuario: number) => {
      const conversacion = await createConversation(idProyecto, { tipo: 'INDIVIDUAL', idsParticipantes: [idUsuario] });
      queryClient.invalidateQueries({ queryKey: allConversationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: projectConversationsQueryKey(idProyecto) });
      abrirChat(idProyecto, conversacion.idConversacion);
    },
    [queryClient, abrirChat],
  );

  const value = useMemo(
    () => ({ windows, minimizedIds, abrirChat, cerrarChat, toggleMinimize, iniciarChatCon }),
    [windows, minimizedIds, abrirChat, cerrarChat, toggleMinimize, iniciarChatCon],
  );

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function useChatDock() {
  return useContext(ChatDockContext);
}
