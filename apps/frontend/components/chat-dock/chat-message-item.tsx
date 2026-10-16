'use client';

import { useState } from 'react';
import { Check, MoreVertical, Pencil, Trash2, X } from 'lucide-react';
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
import { useDeleteMessage, useEditMessage } from '@/hooks/use-chat';
import { confirmar } from '@/lib/mensajes';
import type { ChatMensaje } from '@/lib/types/chat';

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

interface ChatMessageItemProps {
  mensaje: ChatMensaje;
  propio: boolean;
  idProyecto: number;
  idConversacion: number;
}

export function ChatMessageItem({ mensaje: m, propio, idProyecto, idConversacion }: ChatMessageItemProps) {
  const editar = useEditMessage(idProyecto, idConversacion);
  const eliminar = useDeleteMessage(idProyecto, idConversacion);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const eliminado = Boolean(m.eliminadoEn);

  const empezarEdicion = () => {
    setTexto(m.contenido);
    setEditando(true);
  };

  const guardar = () => {
    const contenido = texto.trim();
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
      ? 'bg-primary text-primary-foreground'
      : 'bg-surface-container-high text-on-surface';

  return (
    <div className={`group flex items-end gap-2 ${propio ? 'flex-row-reverse' : ''}`}>
      <Avatar className="size-6 shrink-0">
        {m.remitente.fotoUrl && <AvatarImage src={m.remitente.fotoUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{getIniciales(m.remitente.nombre, m.remitente.apellido)}</AvatarFallback>
      </Avatar>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${colores}`}>
        {!propio && <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.remitente.nombre}</p>}
        {eliminado ? (
          <p className="italic">Mensaje eliminado</p>
        ) : editando ? (
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
          <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
        )}
        <p className={`mt-0.5 text-[10px] ${propio && !eliminado ? 'text-primary-foreground/70' : 'text-tertiary'}`}>
          {formatHora(m.enviadoEn)}
          {m.editadoEn && !eliminado && (
            <span title={`Editado a las ${formatHora(m.editadoEn)}`}> (editado)</span>
          )}
        </p>
      </div>
      {propio && !eliminado && !editando && (
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
            <DropdownMenuItem onClick={empezarEdicion}>
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleEliminar}>
              <Trash2 className="size-4" aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
