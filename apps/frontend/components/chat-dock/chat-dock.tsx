'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { ChatListPopover } from '@/components/chat-dock/chat-list-popover';
import { ChatWindow } from '@/components/chat-dock/chat-window';
import { useAllConversations, useGlobalChatSocket } from '@/hooks/use-chat';

/**
 * Dock global de chat (estilo LinkedIn): fijo abajo a la derecha en
 * cualquier página del dashboard. Reemplaza el panel de chat que vivía
 * dentro del sidebar de cada proyecto — un solo punto de entrada a todos
 * los chats, cruzando proyectos.
 */
export function ChatDock() {
  const [listOpen, setListOpen] = useState(false);
  const { windows, minimizedIds, cerrarChat, toggleMinimize } = useChatDock();
  const { conversations } = useAllConversations();
  useGlobalChatSocket(windows.map((w) => w.idConversacion));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    const cerrarSiEsAfuera = (event: MouseEvent) => {
      if (!listRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener('mousedown', cerrarSiEsAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiEsAfuera);
  }, [listOpen]);

  const totalNoLeidos = conversations.reduce((total, c) => total + c.noLeidos, 0);

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
          />
        ))}
      </div>

      <div ref={listRef} className="pointer-events-auto relative shrink-0">
        {listOpen && (
          <div className="absolute bottom-full right-0 mb-2">
            <ChatListPopover onClose={() => setListOpen(false)} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setListOpen((open) => !open)}
          aria-label={totalNoLeidos > 0 ? `Mensajes, ${totalNoLeidos} sin leer` : 'Mensajes'}
          aria-expanded={listOpen}
          className="flex h-11 items-center gap-2 rounded-t-xl border border-b-0 border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface shadow-raised transition-colors hover:bg-surface-container-high"
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
        </button>
      </div>
    </div>
  );
}
