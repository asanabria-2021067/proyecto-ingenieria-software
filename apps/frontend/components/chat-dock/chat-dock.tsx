'use client';

import { useEffect, useRef, useState } from 'react';
import { BellOff, MessageCircle } from 'lucide-react';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { ChatListPopover } from '@/components/chat-dock/chat-list-popover';
import { ChatWindow } from '@/components/chat-dock/chat-window';
import { SavedMessagesDialog } from '@/components/chat-dock/saved-messages-dialog';
import { useAllConversations, useGlobalChatSocket, useNoMolestar } from '@/hooks/use-chat';
import { useCurrentUser } from '@/hooks/use-current-user';
import { estaEnNoMolestar, totalNoLeidos as contarNoLeidos } from '@/lib/chat-silencio';

/**
 * Dock global de chat (estilo LinkedIn): fijo abajo a la derecha en
 * cualquier página del dashboard. Reemplaza el panel de chat que vivía
 * dentro del sidebar de cada proyecto — un solo punto de entrada a todos
 * los chats, cruzando proyectos.
 */
export function ChatDock() {
  const [listOpen, setListOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const { windows, minimizedIds, cerrarChat, toggleMinimize } = useChatDock();
  const { conversations } = useAllConversations();
  const { isConnected: chatConnected, typingByConversation, emitTyping } = useGlobalChatSocket(windows.map((w) => w.idConversacion));
  const { config: noMolestar } = useNoMolestar();
  const [ahora, setAhora] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);

  // El horario de no molestar entra y sale solo: se reevalua cada minuto.
  useEffect(() => {
    if (!noMolestar?.activo) return;
    const timer = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [noMolestar?.activo]);

  useEffect(() => {
    if (!listOpen) return;
    const cerrarSiEsAfuera = (event: MouseEvent) => {
      // Los diálogos (nuevo chat, mi estado) van en un portal: no cuentan como "afuera".
      if ((event.target as Element).closest?.('[role="dialog"]')) return;
      if (!listRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener('mousedown', cerrarSiEsAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiEsAfuera);
  }, [listOpen]);

  const enNoMolestar = estaEnNoMolestar(noMolestar, ahora);
  const totalNoLeidos = contarNoLeidos(conversations, ahora, noMolestar);

  return (
    // Solo desktop: en mobile, la barra de navegación inferior ya ocupa ese
    // espacio (mismo criterio que el chat del proyecto, antes solo lg:flex).
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden items-end justify-end gap-2 px-4 md:flex lg:px-6">
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

      <div ref={listRef} className="pointer-events-auto relative shrink-0">
        {listOpen && (
          <div className="absolute bottom-full right-0 mb-2">
            <ChatListPopover onClose={() => setListOpen(false)} onOpenSaved={() => setSavedOpen(true)} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setListOpen((open) => !open)}
          aria-label={`Mensajes${enNoMolestar ? ', no molestar activo' : ''}${totalNoLeidos > 0 ? `, ${totalNoLeidos} sin leer` : ''}`}
          aria-expanded={listOpen}
          className="flex h-12 w-72 items-center gap-2 rounded-t-xl border border-b-0 border-outline-variant bg-surface-container-lowest px-5 text-sm font-semibold text-on-surface shadow-raised transition-colors hover:bg-surface-container-high"
        >
          <span className="relative">
            <MessageCircle className="size-4" aria-hidden="true" />
            {totalNoLeidos > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-on-primary">
                {totalNoLeidos > 99 ? '99+' : totalNoLeidos}
              </span>
            )}
          </span>
          Mensajes
          {enNoMolestar && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary">
              <BellOff className="size-3" aria-hidden="true" />
              No molestar
            </span>
          )}
          <span
            role="status"
            title={chatConnected ? 'Chat en vivo conectado' : 'Reconectando chat en vivo…'}
            aria-label={chatConnected ? 'Chat en vivo conectado' : 'Reconectando chat en vivo'}
            className={`size-2 shrink-0 rounded-full ${
              chatConnected ? 'bg-status-success' : 'animate-pulse bg-status-warning'
            }`}
          />
        </button>
      </div>

      <SavedMessagesDialog open={savedOpen} onOpenChange={setSavedOpen} currentUserId={user?.idUsuario ?? null} />
    </div>
  );
}
