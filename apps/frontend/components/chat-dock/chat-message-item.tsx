'use client';

import { useState } from 'react';
import { AlarmClock, Bookmark, BookmarkCheck, Check, ClipboardPlus, Flag, MessagesSquare, MoreVertical, Pencil, Pin, PinOff, Reply, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getIniciales } from '@/components/projects/available-project-card';
import { ReportarDialog } from '@/components/profile/reportar-dialog';
import { ChatAdjuntoChip } from './chat-adjunto';
import { ChatCitaBloque } from './chat-cita';
import { ChatEncuestaTarjeta } from './chat-encuesta';
import { ChatContenido } from './chat-menciones';
import { ChatTarjetasEnlace } from './chat-tarjeta-enlace';
import { NotaVozReproductor } from './chat-nota-voz';
import { LinkPreviewCard } from './link-preview-card';
import { MessageReactions } from './message-reactions';
import { nombreReal } from '@/lib/chat-apodos';
import { etiquetaRespuestas } from '@/lib/chat-hilos';
import { claseBurbujaPropia } from '@/lib/chat-temas';
import { extraerEnlacesInternos } from '@/lib/chat-tarjetas';
import { contenidoAEditable, editableAContenido, mencionesPresentes, type MencionSeleccionada } from '@/lib/mentions/mention-tokens';
import { useDeleteMessage, useEditMessage, useToggleSavedMessage } from '@/hooks/use-chat';
import { confirmar } from '@/lib/mensajes';
import type { ChatMensaje, ChatTemaColor, ChatUsuario } from '@/lib/types/chat';

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

/** Marcador personal: visible al pasar el cursor o enfocar con teclado; fijo si el mensaje ya está guardado. */
function SaveMessageButton({ idProyecto, idConversacion, idMensaje, guardado }: { idProyecto: number; idConversacion: number; idMensaje: number; guardado: boolean }) {
  const alternar = useToggleSavedMessage(idProyecto, idConversacion);
  const texto = guardado ? 'Quitar de guardados' : 'Guardar mensaje';
  const Icono = guardado ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      aria-pressed={guardado}
      disabled={alternar.isPending}
      onClick={() => alternar.mutate(idMensaje, { onError: () => toast.error('No se pudo actualizar el mensaje guardado') })}
      className={`shrink-0 rounded-control p-1 text-text-secondary transition-opacity hover:bg-on-surface/10 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 ${guardado ? 'opacity-100' : 'opacity-0'}`}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{texto}</span>
    </button>
  );
}

interface ChatMessageItemProps {
  mensaje: ChatMensaje;
  propio: boolean;
  idProyecto: number;
  idConversacion: number;
  /** Apodo privado del remitente; el nombre real queda en el tooltip. */
  apodo?: string | null;
  temaColor?: ChatTemaColor | null;
  /** Resalte del mensaje al que se saltó desde la búsqueda o una cita. */
  resaltado?: boolean;
  onResponder: (mensaje: ChatMensaje) => void;
  onIrAlOriginal: (idMensaje: number) => void;
  onReaccionar: (idMensaje: number, emoji: string) => void;
  /** Solo muestra el mensaje: sin editar, eliminar, guardar, adjuntos ni vista previa (canales que no son de proyecto). */
  simple?: boolean;
  /** Quien puede fijar este mensaje (líder del proyecto, autor, o propietario/admin en la organización). */
  puedeFijar?: boolean;
  onFijar?: (mensaje: ChatMensaje, fijar: boolean) => void;
  idUsuarioActual?: number | null;
  /** Líder del proyecto: además del autor, puede cerrar las encuestas. */
  esLider?: boolean;
  /** Participantes de la conversación: dan el nombre vigente de las menciones. */
  participantes?: ChatUsuario[];
  onRecordar?: (mensaje: ChatMensaje) => void;
  onCrearTarea?: (mensaje: ChatMensaje) => void;
  /** MEJ-131: abre el panel con las respuestas del mensaje. */
  onAbrirHilo?: (mensaje: ChatMensaje) => void;
}

export function ChatMessageItem({
  mensaje: m,
  propio,
  idProyecto,
  idConversacion,
  apodo,
  temaColor,
  resaltado = false,
  onResponder,
  onIrAlOriginal,
  onReaccionar,
  simple = false,
  puedeFijar = false,
  onFijar,
  idUsuarioActual = null,
  esLider = false,
  participantes,
  onRecordar,
  onCrearTarea,
  onAbrirHilo,
}: ChatMessageItemProps) {
  const editar = useEditMessage(idProyecto, idConversacion);
  const eliminar = useDeleteMessage(idProyecto, idConversacion);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [mencionesEdicion, setMencionesEdicion] = useState<MencionSeleccionada[]>([]);
  const eliminado = Boolean(m.eliminadoEn);
  const fijable = puedeFijar && onFijar !== undefined;
  const tieneEnlaceInterno =
    typeof window !== 'undefined' && extraerEnlacesInternos(m.contenido, window.location.origin).length > 0;
  const hayAcciones = !simple && (onRecordar !== undefined || onCrearTarea !== undefined);
  // MEJ-154: cualquier mensaje ajeno se puede reportar, tambien en los canales simples.
  const reportable = !propio && !!m.remitente?.idUsuario;

  const empezarEdicion = () => {
    // Las menciones se editan como `@Nombre`; al guardar vuelven a su token.
    const editable = contenidoAEditable(m.contenido);
    setMencionesEdicion(editable.menciones);
    setTexto(editable.texto);
    setEditando(true);
  };

  const guardar = () => {
    const contenido = editableAContenido(texto.trim(), mencionesPresentes(texto, mencionesEdicion));
    if (!contenido || contenido === m.contenido) {
      setEditando(false);
      return;
    }
    editar.mutate(
      { idMensaje: m.idMensaje, contenido },
      {
        onSuccess: () => setEditando(false),
        onError: () => toast.error('No se pudo editar el mensaje'),
      },
    );
  };

  const handleEliminar = async () => {
    const ok = await confirmar({
      titulo: '¿Eliminar este mensaje?',
      descripcion: 'Se elimina para todos los participantes. Esta acción no se puede deshacer.',
      textoAccion: 'Eliminar mensaje',
      destructiva: true,
    });
    if (!ok) return;
    eliminar.mutate(m.idMensaje, { onError: () => toast.error('No se pudo eliminar el mensaje') });
  };

  const colores = eliminado
    ? 'border border-outline-variant bg-transparent text-tertiary'
    : propio
      ? claseBurbujaPropia(temaColor)
      : 'bg-surface-container-high text-on-surface';

  return (
    <div
      data-mensaje-id={m.idMensaje}
      data-mensaje={m.idMensaje}
      tabIndex={-1}
      className={`group flex items-end gap-2 rounded-2xl outline-none ${propio ? 'flex-row-reverse' : ''} data-[resaltado]:ring-2 data-[resaltado]:ring-primary ${resaltado ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <Avatar className="size-6 shrink-0">
        {m.remitente.fotoUrl && <AvatarImage src={m.remitente.fotoUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{getIniciales(m.remitente.nombre, m.remitente.apellido)}</AvatarFallback>
      </Avatar>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${colores}`}>
        {!propio && (
          <p className="mb-0.5 text-[11px] font-semibold opacity-80" title={apodo ? nombreReal(m.remitente) : undefined}>
            {apodo || m.remitente.nombre}
          </p>
        )}
        {m.citado && <ChatCitaBloque cita={m.citado} propio={propio && !eliminado} onIrAlOriginal={onIrAlOriginal} />}
        {eliminado ? (
          <p className="italic">Mensaje eliminado</p>
        ) : (
          <>
            {m.adjunto && !simple &&
              (m.adjunto.duracionSegundos ? (
                <NotaVozReproductor adjunto={m.adjunto} idProyecto={idProyecto} idConversacion={idConversacion} />
              ) : (
                <ChatAdjuntoChip adjunto={m.adjunto} idProyecto={idProyecto} idConversacion={idConversacion} />
              ))}
            {m.encuesta && !simple && (
              <ChatEncuestaTarjeta
                mensaje={m}
                idProyecto={idProyecto}
                idConversacion={idConversacion}
                idUsuarioActual={idUsuarioActual}
                puedeCerrar={propio || esLider}
              />
            )}
            {editando ? (
              <div className="flex items-center gap-1">
                <Input
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      guardar();
                    } else if (event.key === 'Escape') {
                      event.stopPropagation();
                      setEditando(false);
                    }
                  }}
                  maxLength={4000}
                  disabled={editar.isPending}
                  aria-label="Editar mensaje"
                  autoFocus
                  className="h-8 min-w-0 flex-1 bg-surface-container-lowest text-sm text-on-surface"
                />
                <button type="button" onClick={guardar} disabled={editar.isPending} aria-label="Guardar edición" className="rounded-control p-1 hover:bg-on-surface/10">
                  <Check className="size-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setEditando(false)} aria-label="Cancelar edición" className="rounded-control p-1 hover:bg-on-surface/10">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              m.contenido && !m.encuesta && (
                <ChatContenido
                  contenido={m.contenido}
                  participantes={participantes}
                  idUsuarioActual={idUsuarioActual}
                  className={`whitespace-pre-wrap break-words ${m.adjunto ? 'mt-1' : ''}`}
                />
              )
            )}
            {!editando && !simple && <ChatTarjetasEnlace idProyecto={idProyecto} idConversacion={idConversacion} contenido={m.contenido} />}
            {!editando && !simple && !tieneEnlaceInterno && (
              <LinkPreviewCard idProyecto={idProyecto} idConversacion={idConversacion} contenido={m.contenido} />
            )}
          </>
        )}
        <p className={`mt-0.5 text-[10px] ${propio && !eliminado ? '' : 'text-tertiary'}`}>
          {formatHora(m.enviadoEn)}
          {m.fijadoEn && !eliminado && (
            <span className="ml-1 inline-flex items-center gap-0.5 font-semibold">
              <Pin className="size-2.5" aria-hidden="true" />
              Fijado
            </span>
          )}
          {m.editadoEn && !eliminado && (
            <span title={`Editado a las ${formatHora(m.editadoEn)}`}> (editado)</span>
          )}
        </p>
        {!eliminado && !simple && (
          <MessageReactions reacciones={m.reacciones ?? []} onToggle={(emoji) => onReaccionar(m.idMensaje, emoji)} />
        )}
        {onAbrirHilo && !simple && (m.respuestas ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => onAbrirHilo(m)}
            className="mt-1 flex items-center gap-1 text-[11px] font-semibold underline-offset-2 hover:underline"
          >
            <MessagesSquare className="size-3" aria-hidden="true" />
            {etiquetaRespuestas(m.respuestas ?? 0)}
            <span className="sr-only"> de {m.remitente.nombre}. Abrir hilo</span>
          </button>
        )}
      </div>
      {(propio || fijable || hayAcciones || reportable) && !eliminado && !editando && (!simple || fijable || reportable) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Acciones del mensaje"
              className="rounded-control p-1 text-text-secondary opacity-0 hover:bg-on-surface/10 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fijable && (
              <DropdownMenuItem onClick={() => onFijar?.(m, !m.fijadoEn)}>
                {m.fijadoEn ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
                {m.fijadoEn ? 'Desfijar' : 'Fijar'}
              </DropdownMenuItem>
            )}
            {onRecordar && !simple && (
              <DropdownMenuItem onClick={() => onRecordar(m)}>
                <AlarmClock className="size-4" aria-hidden="true" />
                Recuérdamelo
              </DropdownMenuItem>
            )}
            {onCrearTarea && !simple && m.contenido && !m.encuesta && (
              <DropdownMenuItem onClick={() => onCrearTarea(m)}>
                <ClipboardPlus className="size-4" aria-hidden="true" />
                Crear tarea desde este mensaje
              </DropdownMenuItem>
            )}
            {propio && !simple && m.contenido && !m.encuesta && (
              <DropdownMenuItem onClick={empezarEdicion}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar
              </DropdownMenuItem>
            )}
            {reportable && (
              <ReportarDialog
                idReportado={m.remitente.idUsuario}
                nombre={`${m.remitente.nombre} ${m.remitente.apellido}`.trim()}
                idMensaje={m.idMensaje}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Flag className="size-4" aria-hidden="true" />
                    Reportar mensaje
                  </DropdownMenuItem>
                }
              />
            )}
            {propio && !simple && (
              <DropdownMenuItem variant="destructive" onClick={handleEliminar}>
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!eliminado && !simple && (
        <>
          <button
            type="button"
            onClick={() => onResponder(m)}
            aria-label={`Responder a ${m.remitente.nombre}`}
            className="rounded-control p-1 text-text-secondary opacity-0 hover:bg-on-surface/10 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Reply className="size-4" aria-hidden="true" />
          </button>
          {onAbrirHilo && (
            <button
              type="button"
              onClick={() => onAbrirHilo(m)}
              aria-label={`Responder en hilo a ${m.remitente.nombre}`}
              title="Responder en hilo"
              className="rounded-control p-1 text-text-secondary opacity-0 hover:bg-on-surface/10 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MessagesSquare className="size-4" aria-hidden="true" />
            </button>
          )}
          <SaveMessageButton idProyecto={idProyecto} idConversacion={idConversacion} idMensaje={m.idMensaje} guardado={m.guardado === true} />
        </>
      )}
    </div>
  );
}
