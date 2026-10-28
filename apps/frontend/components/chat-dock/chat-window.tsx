'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Link2,
  Hash,
  Loader2,
  MoreVertical,
  Moon,
  Paperclip,
  Palette,
  Pencil,
  Search,
  Send,
  Star,
  StarOff,
  Tag,
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
import { ChatLinksDialog } from './chat-links-dialog';
import { AdjuntoIcono } from './chat-adjunto';
import { ChatMessageItem } from './chat-message-item';
import { ChatSearchPanel } from './chat-search';
import { ApodosDialog } from '@/components/chat-dock/apodos-dialog';
import { nombreMostrado, nombreReal } from '@/lib/chat-apodos';
import { EstadoIndicador } from '@/components/chat-dock/estado-chat';
import { getIniciales } from '@/components/projects/available-project-card';
import {
  useLoadOlderMessages,
  useMessages,
  useSendMessage,
  useSendFileMessage,
  useToggleReaction,
  useUpdateConversation,
  useUpdateChatTheme,
  useDeleteConversation,
  useAllConversations,
  useMarkConversationRead,
  useReadReceipts,
  useSilenciarConversation,
} from '@/hooks/use-chat';
import { quienesVieron, SeenBy, TypingIndicator } from '@/components/chat-dock/chat-indicators';
import { NoMolestarDialog } from '@/components/chat-dock/no-molestar-dialog';
import { estaSilenciada } from '@/lib/chat-silencio';
import { CHAT_ADJUNTO_ACCEPT, formatearTamano, validarArchivoChat } from '@/lib/chat-adjuntos';
import { ChatThemeDialog } from '@/components/chat-dock/chat-theme-dialog';
import { claseAcentoCabecera } from '@/lib/chat-temas';
import { ScheduleMessageButton, ScheduledMessagesList } from '@/components/chat-dock/scheduled-messages';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIrAlMensaje } from '@/hooks/use-ir-al-mensaje';
import { ChatCitaVistaPrevia, extractoDe } from '@/components/chat-dock/chat-cita';
import { confirmar } from '@/lib/mensajes';
import { toast } from 'sonner';
import type { ChatConversacionGlobal, ChatMensaje } from '@/lib/types/chat';
import { SkeletonList } from '@/components/ui/skeleton';

function nombreConversacion(conversacion: ChatConversacionGlobal, currentUserId: number | null): string {
  if (conversacion.esCanal) return `#${conversacion.nombre ?? 'canal'}`;
  if (conversacion.nombrePersonalizado) return conversacion.nombrePersonalizado;
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? nombreMostrado(otro) : 'Conversación';
}

interface ChatWindowProps {
  idProyecto: number;
  idConversacion: number;
  minimized: boolean;
  onMinimize: () => void;
  onClose: () => void;
  /** Ids de quienes están escribiendo en esta conversación ahora mismo. */
  typingUserIds?: number[];
  /** Se llama al teclear; el socket lo limita (throttle). */
  onTyping?: () => void;
}

export function ChatWindow({ idProyecto, idConversacion, minimized, onMinimize, onClose, typingUserIds = [], onTyping }: ChatWindowProps) {
  const { data: user } = useCurrentUser();
  const currentUserId = user?.idUsuario ?? null;
  const { conversations } = useAllConversations();
  const conversacion = conversations.find((c) => c.idConversacion === idConversacion) ?? null;
  const { messages, isLoading } = useMessages(idProyecto, idConversacion);
  const { lecturas } = useReadReceipts(idProyecto, idConversacion);
  const marcarLeido = useMarkConversationRead(idProyecto);
  const enviar = useSendMessage(idProyecto, idConversacion);
  const reaccionar = useToggleReaction(idProyecto, idConversacion);
  const actualizar = useUpdateConversation(idProyecto);
  const eliminar = useDeleteConversation(idProyecto);
  const silenciar = useSilenciarConversation(idProyecto);
  const silenciada = conversacion ? estaSilenciada(conversacion) : false;
  const cambiarTema = useUpdateChatTheme(idProyecto);
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [renombrarAbierto, setRenombrarAbierto] = useState(false);
  const [noMolestarAbierto, setNoMolestarAbierto] = useState(false);
  const [enlacesAbierto, setEnlacesAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const enviarArchivo = useSendFileMessage(idProyecto, idConversacion);
  const enviando = enviar.isPending || enviarArchivo.isPending;
  const [citando, setCitando] = useState<ChatMensaje | null>(null);
  const [apodosAbierto, setApodosAbierto] = useState(false);
  const [temaAbierto, setTemaAbierto] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cargarAnteriores = useLoadOlderMessages(idProyecto, idConversacion);
  const { irAlMensaje } = useIrAlMensaje({
    listRef,
    messages,
    cargarAnteriores,
    onNoDisponible: () => toast.info('El mensaje original ya no está disponible'),
  });
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [saltarA, setSaltarA] = useState<number | null>(null);
  const saltarARef = useRef<number | null>(null);

  // Solo al llegar un mensaje nuevo: cargar páginas anteriores no debe mover la vista al final.
  const ultimoId = messages[messages.length - 1]?.idMensaje;
  useEffect(() => {
    if (!minimized && !saltarARef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [ultimoId, minimized]);

  const responder = (mensaje: ChatMensaje) => {
    setCitando(mensaje);
    inputRef.current?.focus();
  };

  // Con la ventana abierta, lo recibido de otros cuenta como leído (alimenta "visto por" y los no leídos).
  const ultimoMensaje = messages[messages.length - 1];
  const ultimoEsAjeno = ultimoMensaje != null && ultimoMensaje.remitente.idUsuario !== currentUserId;
  const { mutate: marcarLeidoMutate } = marcarLeido;
  useEffect(() => {
    if (!minimized && ultimoEsAjeno) marcarLeidoMutate(idConversacion);
  }, [minimized, ultimoEsAjeno, ultimoId, idConversacion, marcarLeidoMutate]);

  const ultimoPropio = [...messages].reverse().find((m) => m.remitente.idUsuario === currentUserId);
  const vieron = ultimoPropio && conversacion ? quienesVieron(lecturas, conversacion.participantes, ultimoPropio) : [];
  const escribiendo = (conversacion?.participantes ?? [])
    .filter((p) => typingUserIds.includes(p.idUsuario) && p.idUsuario !== currentUserId)
    .map((p) => p.nombre);

  // Salto desde la búsqueda: centra el mensaje, lo enfoca y quita el resalte a los 3 s.
  useEffect(() => {
    saltarARef.current = saltarA;
    if (!saltarA) return;
    const destino = listRef.current?.querySelector<HTMLElement>(`[data-mensaje="${saltarA}"]`);
    destino?.scrollIntoView({ block: 'center' });
    destino?.focus({ preventScroll: true });
    const timer = setTimeout(() => setSaltarA(null), 3000);
    return () => clearTimeout(timer);
  }, [saltarA]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const contenido = texto.trim();
    if (archivo) {
      setErrorArchivo(null);
      enviarArchivo.mutate(
        { contenido, archivo },
        {
          onSuccess: () => {
            setArchivo(null);
            setTexto('');
          },
          onError: (error) => setErrorArchivo(error.message || 'No se pudo enviar el archivo.'),
        },
      );
      return;
    }
    if (!contenido) return;
    setTexto('');
    setCitando(null);
    enviar.mutate({ contenido, idMensajeCitado: citando?.idMensaje });
  };

  const handleArchivo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = event.target.files?.[0];
    event.target.value = '';
    if (!elegido) return;
    const error = validarArchivoChat(elegido);
    setErrorArchivo(error);
    setArchivo(error ? null : elegido);
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
      <div className={`flex shrink-0 items-center gap-2 rounded-t-xl border-b border-outline-variant bg-surface-container px-3 py-2 ${claseAcentoCabecera(conversacion?.temaColor)}`}>
        {conversacion?.tipo === 'GRUPAL' ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            {conversacion.esCanal ? <Hash className="size-3.5" aria-hidden="true" /> : <UsersIcon className="size-3.5" aria-hidden="true" />}
          </span>
        ) : (
          <Avatar className="size-7 shrink-0">
            {otro?.fotoUrl && <AvatarImage src={otro.fotoUrl} alt="" />}
            <AvatarFallback className="text-[10px]">{getIniciales(otro?.nombre ?? '?', otro?.apellido ?? '')}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onMinimize}
            title={otro && !conversacion?.nombrePersonalizado ? nombreReal(otro) : undefined}
            className="block w-full truncate text-left text-sm font-semibold text-on-surface"
          >
            {titulo}
          </button>
          {otro && <EstadoIndicador estado={otro.estado} />}
        </div>
        {silenciada && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-secondary">
            <BellOff className="size-3.5" aria-hidden="true" />
            Silenciado
          </span>
        )}

        <button
          type="button"
          onClick={() => setBuscarAbierto((abierto) => !abierto)}
          aria-label="Buscar en la conversación"
          aria-expanded={buscarAbierto}
          className="motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Opciones de la conversación" className="motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
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
            {!conversacion?.esCanal && (
              <DropdownMenuItem onClick={() => setRenombrarAbierto(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Renombrar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setApodosAbierto(true)}>
              <Tag className="size-4" aria-hidden="true" />
              Apodos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTemaAbierto(true)}>
              <Palette className="size-4" aria-hidden="true" />
              Tema de color
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
            {silenciada ? (
              <DropdownMenuItem onClick={() => silenciar.mutate({ idConversacion, duracion: null })}>
                <Bell className="size-4" aria-hidden="true" />
                Activar notificaciones
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => silenciar.mutate({ idConversacion, duracion: '1h' })}>
                  <BellOff className="size-4" aria-hidden="true" />
                  Silenciar 1 hora
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => silenciar.mutate({ idConversacion, duracion: '8h' })}>
                  <BellOff className="size-4" aria-hidden="true" />
                  Silenciar 8 horas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => silenciar.mutate({ idConversacion, duracion: 'siempre' })}>
                  <BellOff className="size-4" aria-hidden="true" />
                  Silenciar siempre
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => setNoMolestarAbierto(true)}>
              <Moon className="size-4" aria-hidden="true" />
              No molestar por horario
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actualizar.mutate({ idConversacion, payload: { archivada: !conversacion?.archivadaManual } })}
            >
              {conversacion?.archivadaManual ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
              {conversacion?.archivadaManual ? 'Desarchivar' : 'Archivar'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEnlacesAbierto(true)}>
              <Link2 className="size-4" aria-hidden="true" />
              Enlaces compartidos
            </DropdownMenuItem>
            {!conversacion?.esCanal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleBorrar}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Borrar conversación
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" onClick={onMinimize} aria-label={minimized ? 'Expandir chat' : 'Minimizar chat'} className="motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
          {minimized ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={onClose} aria-label="Cerrar chat" className="motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {!minimized && (
        <>
          {buscarAbierto && (
            <ChatSearchPanel
              idProyecto={idProyecto}
              idConversacion={idConversacion}
              participantes={conversacion?.participantes ?? []}
              onJump={setSaltarA}
              onClose={() => setBuscarAbierto(false)}
            />
          )}
          <div ref={listRef} className="h-[40rem] max-h-[60vh] min-h-0 space-y-3 overflow-y-auto px-3 py-3">
            {isLoading && <SkeletonList label="Cargando historial" count={3} lines={1} avatar="circle" layout="plain" />}
            {!isLoading && messages.length === 0 && (
              <p className="text-xs text-tertiary">Todavía no hay mensajes. Sé el primero en escribir.</p>
            )}
            {messages.map((m) => (
              <Fragment key={m.idMensaje}>
                <ChatMessageItem
                  mensaje={m}
                  propio={m.remitente.idUsuario === currentUserId}
                  idProyecto={idProyecto}
                  idConversacion={idConversacion}
                  apodo={m.apodoRemitente ?? conversacion?.participantes.find((p) => p.idUsuario === m.remitente.idUsuario)?.apodo}
                  temaColor={conversacion?.temaColor}
                  resaltado={saltarA === m.idMensaje}
                  onResponder={responder}
                  onIrAlOriginal={irAlMensaje}
                  onReaccionar={(idMensaje, emoji) =>
                    reaccionar.mutate({ idMensaje, emoji }, { onError: () => toast.error('No se pudo reaccionar al mensaje') })
                  }
                />
                {m === ultimoPropio && <SeenBy vieron={vieron} />}
              </Fragment>
            ))}
          </div>

          <TypingIndicator nombres={escribiendo} />

          {(archivo || errorArchivo) && (
            <div className="space-y-1 border-t border-outline-variant px-2 pt-2">
              {archivo && (
                <div className="flex items-center gap-2 rounded-lg bg-surface-container p-2 text-xs text-on-surface" data-testid="adjunto-previa">
                  <AdjuntoIcono mime={archivo.type} className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-semibold" title={archivo.name}>{archivo.name}</span>
                  <span className="shrink-0 text-tertiary">{formatearTamano(archivo.size)}</span>
                  <button
                    type="button"
                    onClick={() => setArchivo(null)}
                    aria-label={`Quitar ${archivo.name}`}
                    className="rounded-control p-0.5 text-text-secondary hover:bg-on-surface/10"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
              {errorArchivo && <p role="alert" className="text-xs text-error">{errorArchivo}</p>}
            </div>
          )}
          {citando && (
            <ChatCitaVistaPrevia
              nombre={`${citando.remitente.nombre} ${citando.remitente.apellido}`.trim()}
              extracto={extractoDe(citando.contenido)}
              onCancelar={() => setCitando(null)}
            />
          )}

          <ScheduledMessagesList idProyecto={idProyecto} idConversacion={idConversacion} />

          <form
            onSubmit={handleSubmit}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && citando) {
                event.stopPropagation();
                setCitando(null);
              }
            }}
            className={`flex items-center gap-2 p-2 ${citando ? '' : 'border-t border-outline-variant'}`}
          >
            <input
              ref={archivoInputRef}
              type="file"
              accept={CHAT_ADJUNTO_ACCEPT}
              onChange={handleArchivo}
              aria-label="Seleccionar archivo para adjuntar"
              tabIndex={-1}
              className="hidden"
              data-testid="adjunto-input"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => archivoInputRef.current?.click()}
              disabled={enviando}
              className="size-9 shrink-0 rounded-full"
              aria-label="Adjuntar archivo"
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </Button>
            <Input
              ref={inputRef}
              value={texto}
              onChange={(event) => {
                setTexto(event.target.value);
                if (event.target.value.trim()) onTyping?.();
              }}
              placeholder="Escribe un mensaje…"
              maxLength={4000}
              disabled={enviando}
              className="h-9 flex-1 rounded-full border-outline-variant text-sm"
            />
            <ScheduleMessageButton
              idProyecto={idProyecto}
              idConversacion={idConversacion}
              texto={texto}
              onScheduled={() => setTexto('')}
            />
            <Button
              type="submit"
              size="icon"
              disabled={enviando || (texto.trim().length === 0 && !archivo)}
              className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              aria-label="Enviar mensaje"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </>
      )}

      <ChatLinksDialog open={enlacesAbierto} onOpenChange={setEnlacesAbierto} idProyecto={idProyecto} idConversacion={idConversacion} />
      {apodosAbierto && conversacion && (
        <ApodosDialog
          open
          onOpenChange={setApodosAbierto}
          idProyecto={idProyecto}
          idConversacion={idConversacion}
          participantes={conversacion.participantes.filter((p) => p.idUsuario !== currentUserId)}
        />
      )}
      <ChatThemeDialog
        open={temaAbierto}
        onOpenChange={setTemaAbierto}
        value={conversacion?.temaColor ?? null}
        onChange={(temaColor) => cambiarTema.mutate({ idConversacion, temaColor })}
      />

      <RenameConversationDialog
        open={renombrarAbierto}
        onOpenChange={setRenombrarAbierto}
        idProyecto={idProyecto}
        idConversacion={idConversacion}
        valorInicial={conversacion?.nombrePersonalizado ?? ''}
      />
      {noMolestarAbierto && <NoMolestarDialog open onOpenChange={setNoMolestarAbierto} />}
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
