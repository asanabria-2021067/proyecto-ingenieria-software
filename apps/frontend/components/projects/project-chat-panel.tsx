'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Lock,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Send,
  Star,
  StarOff,
  Users as UsersIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getIniciales } from '@/components/projects/available-project-card';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  useChatSocket,
  useConversations,
  useCreateConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useUpdateConversation,
} from '@/hooks/use-chat';
import { useChatPanel } from '@/components/projects/chat-panel-context';
import type { ChatConversacion } from '@/lib/types/chat';
import type { MiembroProyecto } from '@/hooks/use-project-members';

interface ProjectChatPanelProps {
  idProyecto: number;
  habilitado: boolean;
  currentUserId: number | null;
  members: MiembroProyecto[];
}

function nombreConversacion(conversacion: ChatConversacion, currentUserId: number | null): string {
  if (conversacion.nombrePersonalizado) return conversacion.nombrePersonalizado;
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? `${otro.nombre} ${otro.apellido}` : 'Conversación';
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

export function ProjectChatPanel({ idProyecto, habilitado, currentUserId, members }: ProjectChatPanelProps) {
  const { conversations, isLoading } = useConversations(idProyecto);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [nuevoChatAbierto, setNuevoChatAbierto] = useState(false);
  const [renombrarConversacion, setRenombrarConversacion] = useState<ChatConversacion | null>(null);
  const markRead = useMarkConversationRead(idProyecto);
  const crearDesdeOtraVista = useCreateConversation(idProyecto);
  const { pendingChatUserId, clearPendingChat } = useChatPanel();

  const { isConnected } = useChatSocket(idProyecto, activeId);

  const abrirConversacion = (idConversacion: number) => {
    setActiveId(idConversacion);
    markRead.mutate(idConversacion);
  };

  // Entrada a un chat 1:1 desde fuera del sidebar (p. ej. el botón "Chat" en
  // la ficha del responsable del proyecto) — createConversation es idempotente
  // para INDIVIDUAL, así que reintentar aquí solo abre la conversación ya
  // existente, nunca duplica una.
  useEffect(() => {
    if (pendingChatUserId == null) return;
    let cancelado = false;
    crearDesdeOtraVista.mutate(
      { tipo: 'INDIVIDUAL', idsParticipantes: [pendingChatUserId] },
      {
        onSuccess: (conversacion) => {
          if (!cancelado) abrirConversacion(conversacion.idConversacion);
        },
        onSettled: () => {
          if (!cancelado) clearPendingChat();
        },
      },
    );
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatUserId]);

  if (!habilitado) return null;

  return (
    // Sección propia, fija abajo en la sidebar del proyecto: borde superior,
    // aire arriba y una lista con alto máximo para no empujar el menú.
    <section
      aria-labelledby="chat-del-proyecto-titulo"
      className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-outline-variant pt-stack"
    >
      <div className="flex items-center justify-between px-stack pb-tight">
        <h2
          id="chat-del-proyecto-titulo"
          className="flex items-center gap-tight text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Chat del proyecto
          <span
            role="status"
            title={isConnected ? 'Chat en vivo conectado' : 'Reconectando chat en vivo…'}
            aria-label={isConnected ? 'Chat en vivo conectado' : 'Reconectando chat en vivo'}
            className={`size-2 shrink-0 rounded-full ${isConnected ? 'bg-primary' : 'animate-pulse bg-destructive'}`}
          />
        </h2>
        <button
          type="button"
          onClick={() => setNuevoChatAbierto(true)}
          aria-label="Nuevo chat"
          className="rounded-control p-1 text-text-secondary transition-colors hover:bg-on-surface/5 hover:text-text-primary"
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-micro overflow-y-auto px-inline pb-stack">
        {isLoading && <p className="px-2 text-xs text-tertiary">Cargando chats…</p>}
        {!isLoading && conversations.length === 0 && (
          <p className="px-2 text-xs text-tertiary">Sin chats todavía. Crea uno con el ícono de arriba.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.idConversacion}
            className={`group flex w-full items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
              activeId === c.idConversacion
                ? 'bg-on-surface/8 font-semibold text-text-primary'
                : 'text-text-primary hover:bg-on-surface/5'
            }`}
          >
            <button
              type="button"
              onClick={() => abrirConversacion(c.idConversacion)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              {c.tipo === 'GRUPAL' ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                  <UsersIcon className="size-3.5" aria-hidden="true" />
                </span>
              ) : (
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getIniciales(
                      c.participantes.find((p) => p.idUsuario !== currentUserId)?.nombre ?? '?',
                      c.participantes.find((p) => p.idUsuario !== currentUserId)?.apellido ?? '',
                    )}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className={`min-w-0 flex-1 truncate font-medium ${c.archivada ? 'text-text-secondary' : ''}`}>
                {nombreConversacion(c, currentUserId)}
              </span>
            </button>
            {c.esFavorita && <Star className="size-3.5 shrink-0 fill-current text-primary" aria-hidden="true" />}
            {c.archivada ? (
              <Lock className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
            ) : (
              c.noLeidos > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
                  {c.noLeidos}
                </span>
              )
            )}
            <ConversationMenu conversacion={c} idProyecto={idProyecto} onRenombrar={() => setRenombrarConversacion(c)} />
          </div>
        ))}
      </div>

      <NewChatDialog
        open={nuevoChatAbierto}
        onOpenChange={setNuevoChatAbierto}
        idProyecto={idProyecto}
        members={members}
        currentUserId={currentUserId}
        onCreated={abrirConversacion}
      />

      <RenameConversationDialog
        key={renombrarConversacion?.idConversacion ?? 'ninguna'}
        conversacion={renombrarConversacion}
        idProyecto={idProyecto}
        onOpenChange={(open) => {
          if (!open) setRenombrarConversacion(null);
        }}
      />

      <ChatThreadSheet
        idProyecto={idProyecto}
        idConversacion={activeId}
        conversations={conversations}
        currentUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      />
    </section>
  );
}

interface ConversationMenuProps {
  conversacion: ChatConversacion;
  idProyecto: number;
  onRenombrar: () => void;
}

/** Menú de 3 puntos de cada conversación: archivar, renombrar o marcar favorita. */
function ConversationMenu({ conversacion, idProyecto, onRenombrar }: ConversationMenuProps) {
  const actualizar = useUpdateConversation(idProyecto);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="Opciones de la conversación"
          className="shrink-0 rounded-control p-1 text-text-secondary opacity-0 transition-opacity hover:bg-on-surface/10 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            actualizar.mutate({
              idConversacion: conversacion.idConversacion,
              payload: { archivada: !conversacion.archivadaManual },
            })
          }
        >
          {conversacion.archivadaManual ? (
            <ArchiveRestore className="size-4" aria-hidden="true" />
          ) : (
            <Archive className="size-4" aria-hidden="true" />
          )}
          {conversacion.archivadaManual ? 'Desarchivar' : 'Archivar'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRenombrar}>
          <Pencil className="size-4" aria-hidden="true" />
          Renombrar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            actualizar.mutate({
              idConversacion: conversacion.idConversacion,
              payload: { esFavorita: !conversacion.esFavorita },
            })
          }
        >
          {conversacion.esFavorita ? (
            <StarOff className="size-4" aria-hidden="true" />
          ) : (
            <Star className="size-4" aria-hidden="true" />
          )}
          {conversacion.esFavorita ? 'Quitar de favoritos' : 'Marcar como favorito'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RenameConversationDialogProps {
  conversacion: ChatConversacion | null;
  idProyecto: number;
  onOpenChange: (open: boolean) => void;
}

function RenameConversationDialog({ conversacion, idProyecto, onOpenChange }: RenameConversationDialogProps) {
  const actualizar = useUpdateConversation(idProyecto);
  const [nombre, setNombre] = useState(conversacion?.nombrePersonalizado ?? '');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conversacion) return;
    actualizar.mutate(
      { idConversacion: conversacion.idConversacion, payload: { nombrePersonalizado: nombre.trim() || null } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={conversacion != null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[380px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Renombrar conversación</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Deja el campo vacío para volver al nombre por defecto.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            <label htmlFor="chat-nombre-personalizado" className="text-xs font-semibold text-on-surface">
              Nombre
            </label>
            <Input
              id="chat-nombre-personalizado"
              value={nombre}
              maxLength={120}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej. Equipo backend"
              className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={actualizar.isPending}
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={actualizar.isPending}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              {actualizar.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  members: MiembroProyecto[];
  currentUserId: number | null;
  onCreated: (idConversacion: number) => void;
}

function NewChatDialog({ open, onOpenChange, idProyecto, members, currentUserId, onCreated }: NewChatDialogProps) {
  const [tipo, setTipo] = useState<'GRUPAL' | 'INDIVIDUAL'>('INDIVIDUAL');
  const [nombre, setNombre] = useState('');
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const crear = useCreateConversation(idProyecto);

  const otrosMiembros = members.filter((m) => m.idUsuario !== currentUserId);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTipo('INDIVIDUAL');
      setNombre('');
      setSeleccionados([]);
      setError(null);
    }
    onOpenChange(next);
  };

  const toggleSeleccionado = (idUsuario: number) => {
    setSeleccionados((current) => {
      if (tipo === 'INDIVIDUAL') return current.includes(idUsuario) ? [] : [idUsuario];
      return current.includes(idUsuario)
        ? current.filter((id) => id !== idUsuario)
        : [...current, idUsuario];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (seleccionados.length === 0) {
      setError('Selecciona al menos un integrante.');
      return;
    }
    setError(null);
    try {
      const conversacion = await crear.mutateAsync({
        tipo,
        nombre: tipo === 'GRUPAL' ? nombre.trim() || undefined : undefined,
        idsParticipantes: seleccionados,
      });
      handleOpenChange(false);
      onCreated(conversacion.idConversacion);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'chat'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[420px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Nuevo chat</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Crea una conversación individual o grupal con el equipo del proyecto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={tipo === 'INDIVIDUAL' ? 'default' : 'outline'}
                className={tipo === 'INDIVIDUAL' ? 'text-primary-foreground hover:text-primary-foreground' : ''}
                onClick={() => {
                  setTipo('INDIVIDUAL');
                  setSeleccionados((current) => current.slice(0, 1));
                }}
              >
                Individual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tipo === 'GRUPAL' ? 'default' : 'outline'}
                className={tipo === 'GRUPAL' ? 'text-primary-foreground hover:text-primary-foreground' : ''}
                onClick={() => setTipo('GRUPAL')}
              >
                Grupal
              </Button>
            </div>

            {tipo === 'GRUPAL' && (
              <div>
                <label htmlFor="chat-nombre" className="text-xs font-semibold text-on-surface">
                  Nombre del grupo (opcional)
                </label>
                <Input
                  id="chat-nombre"
                  value={nombre}
                  maxLength={255}
                  onChange={(event) => setNombre(event.target.value)}
                  placeholder="Ej. Backend"
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-on-surface">
                {tipo === 'INDIVIDUAL' ? 'Con quién' : 'Integrantes'}
              </p>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {otrosMiembros.length === 0 && (
                  <p className="text-xs text-tertiary">No hay más integrantes en este proyecto.</p>
                )}
                {otrosMiembros.map((m) => (
                  <label
                    key={m.idUsuario}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-container-high"
                  >
                    <Checkbox
                      checked={seleccionados.includes(m.idUsuario)}
                      onCheckedChange={() => toggleSeleccionado(m.idUsuario)}
                    />
                    <Avatar className="size-6 shrink-0">
                      {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">{getIniciales(m.nombre, m.apellido)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm text-on-surface">
                      {m.nombre} {m.apellido}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="type-meta text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={crear.isPending}
              onClick={() => handleOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={crear.isPending}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              {crear.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {crear.isPending ? 'Creando...' : 'Crear chat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ChatThreadSheetProps {
  idProyecto: number;
  idConversacion: number | null;
  conversations: ChatConversacion[];
  currentUserId: number | null;
  onOpenChange: (open: boolean) => void;
}

function ChatThreadSheet({ idProyecto, idConversacion, conversations, currentUserId, onOpenChange }: ChatThreadSheetProps) {
  const { messages, isLoading } = useMessages(idProyecto, idConversacion);
  const enviar = useSendMessage(idProyecto, idConversacion);
  const [texto, setTexto] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const conversacion = conversations.find((c) => c.idConversacion === idConversacion) ?? null;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;
    setTexto('');
    enviar.mutate(contenido);
  };

  return (
    <Sheet open={idConversacion != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-outline-variant px-4 py-3.5 text-left">
          <SheetTitle className="text-base font-bold text-on-surface">
            {conversacion ? nombreConversacion(conversacion, currentUserId) : 'Chat'}
          </SheetTitle>
        </SheetHeader>

        {conversacion?.archivada && (
          <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container px-4 py-2.5">
            <Lock className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
            <p className="type-meta text-text-secondary">
              El proyecto ya cerró. Esta conversación quedó archivada y en solo lectura.
            </p>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {isLoading && <p className="text-xs text-tertiary">Cargando historial…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-xs text-tertiary">Todavía no hay mensajes. Sé el primero en escribir.</p>
          )}
          {messages.map((m) => {
            const propio = m.remitente.idUsuario === currentUserId;
            return (
              <div key={m.idMensaje} className={`flex items-end gap-2 ${propio ? 'flex-row-reverse' : ''}`}>
                <Avatar className="size-6 shrink-0">
                  {m.remitente.fotoUrl && <AvatarImage src={m.remitente.fotoUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">
                    {getIniciales(m.remitente.nombre, m.remitente.apellido)}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  propio
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-container-high text-on-surface'
                }`}>
                  {!propio && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                      {m.remitente.nombre}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                  <p className={`mt-0.5 text-[10px] ${propio ? 'text-primary-foreground/70' : 'text-tertiary'}`}>
                    {formatHora(m.enviadoEn)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {!conversacion?.archivada && (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-outline-variant p-3">
            <Input
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder="Escribe un mensaje…"
              maxLength={4000}
              disabled={enviar.isPending}
              className="h-10 flex-1 rounded-full border-outline-variant text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={enviar.isPending || texto.trim().length === 0}
              className="size-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              aria-label="Enviar mensaje"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
