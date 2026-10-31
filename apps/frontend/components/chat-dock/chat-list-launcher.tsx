'use client';

import { useEffect, useRef, useState } from 'react';
import { BellOff, MessageCircle } from 'lucide-react';
import { ChatListPopover } from '@/components/chat-dock/chat-list-popover';
import { SavedMessagesDialog } from '@/components/chat-dock/saved-messages-dialog';
import { useChatNoLeidos } from '@/components/chat-dock/use-chat-no-leidos';
import { useCurrentUser } from '@/hooks/use-current-user';

/** Evento que abre la lista de chats desde fuera (el ítem «Mensajes» de la barra lateral). */
export const ABRIR_LISTA_CHATS = 'abrir-lista-chats';

/**
 * Botón + panel de la lista de chats. Un solo componente para los dos puntos de
 * entrada: `barra` (icono junto a la campana, desde escritorio) y `flotante`
 * (móvil, abajo a la derecha).
 */
export function ChatListLauncher({ variante, conectado = true }: { variante: 'barra' | 'flotante'; conectado?: boolean }) {
  const [listOpen, setListOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [enfocarBuscador, setEnfocarBuscador] = useState(false);
  const { data: user } = useCurrentUser();
  const { total, enNoMolestar } = useChatNoLeidos();
  const listRef = useRef<HTMLDivElement>(null);
  const esBarra = variante === 'barra';

  useEffect(() => {
    if (!listOpen) return;
    const cerrarSiEsAfuera = (event: MouseEvent) => {
      // Los diálogos (nuevo chat, mi estado) y sus listas desplegables (Select) van en portales: no cuentan como «afuera».
      if ((event.target as Element).closest?.('[role="dialog"], [role="listbox"]')) return;
      if (!listRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener('mousedown', cerrarSiEsAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiEsAfuera);
  }, [listOpen]);

  useEffect(() => {
    if (!esBarra) return;
    // El listener sigue montado aunque el contenedor esté oculto por CSS.
    const abrir = () => {
      setEnfocarBuscador(true);
      setListOpen(true);
    };
    window.addEventListener(ABRIR_LISTA_CHATS, abrir);
    return () => window.removeEventListener(ABRIR_LISTA_CHATS, abrir);
  }, [esBarra]);

  const etiqueta = `Mensajes${enNoMolestar ? ', no molestar activo' : ''}${total > 0 ? `, ${total} sin leer` : ''}`;

  return (
    <div ref={listRef} className={esBarra ? 'relative hidden md:block' : 'pointer-events-auto relative shrink-0 md:hidden'}>
      {listOpen && (
        <div className={esBarra ? 'absolute right-0 top-full z-[60] mt-2' : 'absolute bottom-full right-0 mb-2'}>
          <ChatListPopover onClose={() => setListOpen(false)} onOpenSaved={() => setSavedOpen(true)} enfocarBuscador={enfocarBuscador} />
        </div>
      )}
      {esBarra ? (
        <button
          type="button"
          onClick={() => {
            setEnfocarBuscador(false);
            setListOpen((open) => !open);
          }}
          aria-label={etiqueta}
          title="Mensajes"
          aria-expanded={listOpen}
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-on-surface hover:bg-surface-container-high motion-icon"
        >
          <div className="relative">
            <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {total > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-black text-destructive-foreground ring-2 ring-surface-container-low">
                {total > 99 ? '99+' : total}
              </span>
            )}
            {enNoMolestar && (
              <BellOff className="absolute -bottom-1.5 -right-1.5 size-3 rounded-full bg-card text-text-secondary" aria-hidden="true" />
            )}
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setListOpen((open) => !open)}
          aria-label={etiqueta}
          aria-expanded={listOpen}
          className="flex h-12 w-72 items-center gap-2 rounded-t-md border border-b-0 border-outline-variant bg-surface-container-lowest px-5 text-sm font-semibold text-on-surface shadow-raised motion-control hover:border-outline hover:bg-surface-container-high hover:shadow-lg"
        >
          <span className="relative">
            <MessageCircle className="size-4" aria-hidden="true" />
            {total > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-on-primary">
                {total > 99 ? '99+' : total}
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
            title={conectado ? 'Chat en vivo conectado' : 'Reconectando chat en vivo…'}
            aria-label={conectado ? 'Chat en vivo conectado' : 'Reconectando chat en vivo'}
            className={`size-2 shrink-0 rounded-full ${conectado ? 'bg-status-success' : 'animate-pulse bg-status-warning'}`}
          />
        </button>
      )}
      <SavedMessagesDialog open={savedOpen} onOpenChange={setSavedOpen} currentUserId={user?.idUsuario ?? null} />
    </div>
  );
}
