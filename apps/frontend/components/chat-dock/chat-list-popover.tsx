'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { getIniciales } from '@/components/projects/available-project-card';
import { useAllConversations } from '@/hooks/use-chat';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import type { ChatConversacionGlobal } from '@/lib/types/chat';

function nombreConversacion(conversacion: ChatConversacionGlobal, currentUserId: number | null): string {
  if (conversacion.nombrePersonalizado) return conversacion.nombrePersonalizado;
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? `${otro.nombre} ${otro.apellido}` : 'Conversación';
}

function estadoUltimoMensaje(conversacion: ChatConversacionGlobal): string | null {
  if (!conversacion.ultimoMensaje) return null;
  // ponytail: sin recibos de lectura por participante, "Visto" no se puede
  // distinguir de "Enviado" con lo que expone hoy el backend — solo se
  // muestra cuando el último mensaje es propio.
  return conversacion.ultimoMensajeEsPropio ? 'Enviado' : null;
}

interface ChatListPopoverProps {
  onClose: () => void;
}

export function ChatListPopover({ onClose }: ChatListPopoverProps) {
  const { data: user } = useCurrentUser();
  const currentUserId = user?.idUsuario ?? null;
  const { abrirChat } = useChatDock();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<'prioritarios' | 'otros'>('prioritarios');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { conversations, isLoading } = useAllConversations(debouncedQuery);

  const filtradas = useMemo(
    () => conversations.filter((c) => (tab === 'prioritarios' ? c.esPrioritaria : !c.esPrioritaria)),
    [conversations, tab],
  );

  return (
    <div className="flex h-[28rem] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-raised">
      <div className="shrink-0 border-b border-outline-variant px-3 pb-2 pt-3">
        <p className="px-1 pb-2 text-sm font-bold text-on-surface">Mensajes</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mensajes"
            aria-label="Buscar por nombre de chat o por mensajes enviados"
            className="h-9 rounded-full border-outline-variant pl-8 text-sm"
          />
        </div>
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => setTab('prioritarios')}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${tab === 'prioritarios' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-on-surface/5'}`}
          >
            Prioritarios
          </button>
          <button
            type="button"
            onClick={() => setTab('otros')}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${tab === 'otros' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-on-surface/5'}`}
          >
            Otros
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="px-4 py-6 text-center text-xs text-tertiary">Cargando chats…</p>}
        {!isLoading && filtradas.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-tertiary">
            {debouncedQuery ? 'Sin resultados para esa búsqueda.' : 'No tienes chats aquí todavía.'}
          </p>
        )}
        {filtradas.map((c) => {
          const otro = c.tipo === 'INDIVIDUAL' ? c.participantes.find((p) => p.idUsuario !== currentUserId) : null;
          const estado = estadoUltimoMensaje(c);
          return (
            <button
              key={c.idConversacion}
              type="button"
              onClick={() => {
                abrirChat(c.idProyecto, c.idConversacion);
                onClose();
              }}
              className="flex w-full items-start gap-2.5 border-b border-outline-variant/50 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-high"
            >
              {c.tipo === 'GRUPAL' ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                  <UsersIcon className="size-4" aria-hidden="true" />
                </span>
              ) : (
                <Avatar className="size-9 shrink-0">
                  {otro?.fotoUrl && <AvatarImage src={otro.fotoUrl} alt="" />}
                  <AvatarFallback className="text-xs">{getIniciales(otro?.nombre ?? '?', otro?.apellido ?? '')}</AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-on-surface">{nombreConversacion(c, currentUserId)}</span>
                  {c.noLeidos > 0 && (
                    <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
                      {c.noLeidos}
                    </span>
                  )}
                </div>
                <span className="mt-0.5 inline-block truncate rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                  {c.proyecto.tituloProyecto}
                </span>
                <p className="mt-0.5 truncate text-xs text-tertiary">
                  {c.ultimoMensaje ? c.ultimoMensaje.contenido : 'Sin mensajes todavía'}
                  {estado ? ` · ${estado}` : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
