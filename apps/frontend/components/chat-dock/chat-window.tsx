'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreVertical,
  Pencil,
  Send,
  Star,
  StarOff,
  Trash2,
  User,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getIniciales } from '@/components/projects/available-project-card';
import { useMessages, useSendMessage, useUpdateConversation, useDeleteConversation, useAllConversations } from '@/hooks/use-chat';
import { useCurrentUser } from '@/hooks/use-current-user';
import { confirmar } from '@/lib/mensajes';
import { toast } from 'sonner';
import type { ChatConversacionGlobal } from '@/lib/types/chat';

function nombreConversacion(conversacion: ChatConversacionGlobal, currentUserId: number | null): string {
  if (conversacion.nombrePersonalizado) return conversacion.nombrePersonalizado;
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? `${otro.nombre} ${otro.apellido}` : 'Conversación';
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

interface ChatWindowProps {
  idProyecto: number;
  idConversacion: number;
  minimized: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

export function ChatWindow({ idProyecto, idConversacion, minimized, onMinimize, onClose }: ChatWindowProps) {
  const { data: user } = useCurrentUser();
  const currentUserId = user?.idUsuario ?? null;
  const { conversations } = useAllConversations();
  const conversacion = conversations.find((c) => c.idConversacion === idConversacion) ?? null;
  const { messages, isLoading } = useMessages(idProyecto, idConversacion);
  const enviar = useSendMessage(idProyecto, idConversacion);
  const actualizar = useUpdateConversation(idProyecto);
  const eliminar = useDeleteConversation(idProyecto);
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [renombrarAbierto, setRenombrarAbierto] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!minimized) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, minimized]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;
    setTexto('');
    enviar.mutate(contenido);
  };

  const handleBorrar = async () => {
    const ok = await confirmar({
      titulo: '¿Borrar esta conversación?',
      descripcion: 'Se elimina para todos los participantes. Esta acción no se puede deshacer.',
      textoAccion: 'Borrar conversación',
      destructiva: true,
    });
    if (!ok) return;
    eliminar.mutate(idConversacion, {
      onSuccess: () => {
        onClose();
        toast.success('Conversación borrada');
      },
      onError: () => toast.error('No se pudo borrar la conversación'),
    });
  };

  const otro = conversacion?.tipo === 'INDIVIDUAL' ? conversacion.participantes.find((p) => p.idUsuario !== currentUserId) : null;
  const titulo = conversacion ? nombreConversacion(conversacion, currentUserId) : 'Chat';

  return (
    <div className="flex w-[36rem] shrink-0 flex-col rounded-t-xl border border-b-0 border-outline-variant bg-surface-container-lowest shadow-raised max-w-[calc(100vw-2rem)]">
      <div className="flex shrink-0 items-center gap-2 rounded-t-xl border-b border-outline-variant bg-surface-container px-3 py-2">
        {conversacion?.tipo === 'GRUPAL' ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <UsersIcon className="size-3.5" aria-hidden="true" />
          </span>
        ) : (
          <Avatar className="size-7 shrink-0">
            {otro?.fotoUrl && <AvatarImage src={otro.fotoUrl} alt="" />}
            <AvatarFallback className="text-[10px]">{getIniciales(otro?.nombre ?? '?', otro?.apellido ?? '')}</AvatarFallback>
          </Avatar>
        )}
        <button
          type="button"
          onClick={onMinimize}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-on-surface"
        >
          {titulo}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Opciones de la conversación" className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
              <MoreVertical className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {otro && (
              <DropdownMenuItem onClick={() => router.push(`/dashboard/personas/${otro.idUsuario}`)}>
                <User className="size-4" aria-hidden="true" />
                Ver perfil
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setRenombrarAbierto(true)}>
              <Pencil className="size-4" aria-hidden="true" />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actualizar.mutate({ idConversacion, payload: { esFavorita: !conversacion?.esFavorita } })}
            >
              {conversacion?.esFavorita ? <StarOff className="size-4" aria-hidden="true" /> : <Star className="size-4" aria-hidden="true" />}
              {conversacion?.esFavorita ? 'Quitar de favoritos' : 'Marcar como favorito'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actualizar.mutate({ idConversacion, payload: { esPrioritaria: !conversacion?.esPrioritaria } })}
            >
              {conversacion?.esPrioritaria ? 'Mover a Otros' : 'Mover a Prioritarios'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actualizar.mutate({ idConversacion, payload: { silenciada: !conversacion?.silenciada } })}
            >
              {conversacion?.silenciada ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
              {conversacion?.silenciada ? 'Activar notificaciones' : 'Silenciar'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actualizar.mutate({ idConversacion, payload: { archivada: !conversacion?.archivadaManual } })}
            >
              {conversacion?.archivadaManual ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
              {conversacion?.archivadaManual ? 'Desarchivar' : 'Archivar'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleBorrar}>
              <Trash2 className="size-4" aria-hidden="true" />
              Borrar conversación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" onClick={onMinimize} aria-label={minimized ? 'Expandir chat' : 'Minimizar chat'} className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
          {minimized ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={onClose} aria-label="Cerrar chat" className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {!minimized && (
        <>
          <div ref={listRef} className="h-[40rem] max-h-[60vh] min-h-0 space-y-3 overflow-y-auto px-3 py-3">
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
                    <AvatarFallback className="text-[10px]">{getIniciales(m.remitente.nombre, m.remitente.apellido)}</AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${propio ? 'bg-primary text-primary-foreground' : 'bg-surface-container-high text-on-surface'}`}>
                    {!propio && <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.remitente.nombre}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                    <p className={`mt-0.5 text-[10px] ${propio ? 'text-primary-foreground/70' : 'text-tertiary'}`}>{formatHora(m.enviadoEn)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-outline-variant p-2">
            <Input
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder="Escribe un mensaje…"
              maxLength={4000}
              disabled={enviar.isPending}
              className="h-9 flex-1 rounded-full border-outline-variant text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={enviar.isPending || texto.trim().length === 0}
              className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              aria-label="Enviar mensaje"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </>
      )}

      <RenameConversationDialog
        open={renombrarAbierto}
        onOpenChange={setRenombrarAbierto}
        idProyecto={idProyecto}
        idConversacion={idConversacion}
        valorInicial={conversacion?.nombrePersonalizado ?? ''}
      />
    </div>
  );
}

interface RenameConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idConversacion: number;
  valorInicial: string;
}

function RenameConversationDialog({ open, onOpenChange, idProyecto, idConversacion, valorInicial }: RenameConversationDialogProps) {
  const actualizar = useUpdateConversation(idProyecto);
  const [nombre, setNombre] = useState(valorInicial);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    actualizar.mutate(
      { idConversacion, payload: { nombrePersonalizado: nombre.trim() || null } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[380px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Renombrar conversación</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Deja el campo vacío para volver al nombre por defecto.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            <label htmlFor="chat-dock-nombre-personalizado" className="text-xs font-semibold text-on-surface">
              Nombre
            </label>
            <Input
              id="chat-dock-nombre-personalizado"
              value={nombre}
              maxLength={120}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej. Equipo backend"
              className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" disabled={actualizar.isPending} onClick={() => onOpenChange(false)} className="h-10 rounded-md border-outline-variant text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={actualizar.isPending} className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
              {actualizar.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
