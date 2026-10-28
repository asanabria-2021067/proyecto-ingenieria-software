'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellOff, Bookmark, Hash, Search, SquarePen, Users as UsersIcon, UserCog } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { getIniciales } from '@/components/projects/available-project-card';
import { nombreMostrado, nombreReal } from '@/lib/chat-apodos';
import { useAllConversations } from '@/hooks/use-chat';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { NewChatDialog } from '@/components/chat-dock/new-chat-dialog';
import { estaSilenciada } from '@/lib/chat-silencio';
import { EstadoIndicador, MiEstadoBoton } from '@/components/chat-dock/estado-chat';
import { ChannelDialog, useProyectosQueLidero } from '@/components/chat-dock/channel-dialog';
import type { ChatConversacionGlobal } from '@/lib/types/chat';
import { SkeletonList } from '@/components/ui/skeleton';

function nombreConversacion(conversacion: ChatConversacionGlobal, currentUserId: number | null): string {
  if (conversacion.esCanal) return `#${conversacion.nombre ?? 'canal'}`;
  if (conversacion.nombrePersonalizado) return conversacion.nombrePersonalizado;
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? nombreMostrado(otro) : 'Conversación';
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
  /** Abre el diálogo de mensajes guardados (vive en ChatDock para sobrevivir al cierre de este popover). */
  onOpenSaved?: () => void;
}

export function ChatListPopover({ onClose, onOpenSaved }: ChatListPopoverProps) {
  const { data: user } = useCurrentUser();
  const currentUserId = user?.idUsuario ?? null;
  const { abrirChat } = useChatDock();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<'prioritarios' | 'otros'>('prioritarios');
  const [nuevoChatAbierto, setNuevoChatAbierto] = useState(false);
  // undefined = cerrado; null = crear canal; conversación = gestionar sus miembros.
  const [canalDialogo, setCanalDialogo] = useState<ChatConversacionGlobal | null | undefined>(undefined);
  const { data: proyectosLiderados } = useProyectosQueLidero(true);
  const idsLiderados = useMemo(() => new Set((proyectosLiderados ?? []).map((p) => p.idProyecto)), [proyectosLiderados]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { conversations, isLoading } = useAllConversations(debouncedQuery);

  // Los canales viven en su propia sección, fuera de las pestañas Prioritarios/Otros.
  const canales = useMemo(() => conversations.filter((c) => c.esCanal), [conversations]);
  const filtradas = useMemo(
    () => conversations.filter((c) => !c.esCanal && (tab === 'prioritarios' ? c.esPrioritaria : !c.esPrioritaria)),
    [conversations, tab],
  );

  return (
    <div className="flex h-[28rem] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-raised">
      <div className="shrink-0 border-b border-outline-variant px-3 pb-2 pt-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-sm font-bold text-on-surface">Mensajes</p>
          <div className="flex items-center gap-1">
            <MiEstadoBoton />
            {onOpenSaved && (
              <button
                type="button"
                onClick={() => {
                  onOpenSaved();
                  onClose();
                }}
                aria-label="Ver mensajes guardados"
                title="Ver mensajes guardados"
                className="flex size-7 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/10 hover:text-text-primary"
              >
                <Bookmark className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setNuevoChatAbierto(true)}
              aria-label="Nuevo chat"
              title="Nuevo chat"
              className="flex size-7 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/10 hover:text-text-primary"
            >
              <SquarePen className="size-4" aria-hidden="true" />
            </button>
            {idsLiderados.size > 0 && (
              <button
                type="button"
                onClick={() => setCanalDialogo(null)}
                aria-label="Crear canal"
                title="Crear canal"
                className="flex size-7 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/10 hover:text-text-primary"
              >
                <Hash className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
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
        {canales.length > 0 && (
          <section aria-labelledby="chat-canales-titulo" className="border-b border-outline-variant">
            <h3 id="chat-canales-titulo" className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              Canales
            </h3>
            <ul>
              {canales.map((c) => (
                <li key={c.idConversacion} className="flex items-center hover:bg-surface-container-high">
                  <button
                    type="button"
                    onClick={() => {
                      abrirChat(c.idProyecto, c.idConversacion);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary-container text-on-secondary-container">
                      <Hash className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-on-surface">
                        <span className="sr-only">Canal </span>
                        {nombreConversacion(c, currentUserId)}
                      </span>
                      <span className="block truncate text-[10px] text-text-secondary">{c.proyecto.tituloProyecto}</span>
                    </span>
                    {c.noLeidos > 0 && (
                      <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
                        {c.noLeidos}
                      </span>
                    )}
                  </button>
                  {idsLiderados.has(c.idProyecto) && (
                    <button
                      type="button"
                      onClick={() => setCanalDialogo(c)}
                      aria-label={`Gestionar miembros de ${nombreConversacion(c, currentUserId)}`}
                      title="Gestionar miembros"
                      className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-on-surface/10 hover:text-text-primary"
                    >
                      <UserCog className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {isLoading && (
          <SkeletonList label="Cargando chats" count={4} lines={2} avatar="circle" layout="plain" className="px-4 py-stack" />
        )}
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
                  <span className="truncate text-sm font-semibold text-on-surface" title={otro?.apodo ? nombreReal(otro) : undefined}>{nombreConversacion(c, currentUserId)}</span>
                  {estaSilenciada(c) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-text-secondary">
                      <BellOff className="size-3" aria-hidden="true" />
                      Silenciado
                    </span>
                  ) : (
                    c.noLeidos > 0 && (
                      <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
                        {c.noLeidos}
                      </span>
                    )
                  )}
                </div>
                <span className="mt-0.5 inline-block truncate rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                  {c.proyecto.tituloProyecto}
                </span>
                {otro && <EstadoIndicador estado={otro.estado} />}
                <p className="mt-0.5 truncate text-xs text-tertiary">
                  {c.ultimoMensaje ? (c.ultimoMensaje.eliminadoEn ? 'Mensaje eliminado' : c.ultimoMensaje.contenido) : 'Sin mensajes todavía'}
                  {estado ? ` · ${estado}` : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <NewChatDialog open={nuevoChatAbierto} onOpenChange={setNuevoChatAbierto} currentUserId={currentUserId} />
      {canalDialogo !== undefined && (
        <ChannelDialog
          key={canalDialogo?.idConversacion ?? 'nuevo'}
          canal={canalDialogo ?? undefined}
          currentUserId={currentUserId}
          onOpenChange={(open) => !open && setCanalDialogo(undefined)}
        />
      )}
    </div>
  );
}
