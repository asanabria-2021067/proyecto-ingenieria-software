'use client';

import { BookmarkX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { useSavedMessages, useToggleSavedMessage } from '@/hooks/use-chat';
import type { MensajeGuardadoItem } from '@/lib/types/chat';

function tituloConversacion(c: MensajeGuardadoItem['conversacion'], currentUserId: number | null): string {
  if (c.nombrePersonalizado) return c.nombrePersonalizado;
  if (c.tipo === 'GRUPAL') return c.nombre ?? 'Grupo';
  const otro = c.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? `${otro.nombre} ${otro.apellido}` : 'Conversación';
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
}

interface SavedMessageRowProps {
  item: MensajeGuardadoItem;
  currentUserId: number | null;
  onOpen: () => void;
}

function SavedMessageRow({ item, currentUserId, onOpen }: SavedMessageRowProps) {
  const { idConversacion, idProyecto } = item.conversacion;
  const quitar = useToggleSavedMessage(idProyecto, idConversacion);
  const titulo = tituloConversacion(item.conversacion, currentUserId);

  return (
    <li className="flex items-start gap-2 border-b border-outline-variant/50 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ir a la conversación ${titulo}`}
        className="min-w-0 flex-1 rounded-control text-left transition-colors hover:bg-surface-container-high"
      >
        <span className="block truncate text-xs font-semibold text-on-surface">
          {item.remitente.nombre} {item.remitente.apellido} <span className="font-normal text-tertiary">en {titulo}</span>
        </span>
        <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap break-words text-sm text-on-surface">{item.contenido}</span>
        <span className="mt-0.5 block text-[10px] text-tertiary">{formatFecha(item.enviadoEn)}</span>
      </button>
      <button
        type="button"
        disabled={quitar.isPending}
        onClick={() => quitar.mutate(item.idMensaje, { onError: () => toast.error('No se pudo quitar el mensaje de guardados') })}
        className="shrink-0 rounded-control p-1.5 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
      >
        <BookmarkX className="size-4" aria-hidden="true" />
        <span className="sr-only">Quitar de guardados</span>
      </button>
    </li>
  );
}

interface SavedMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: number | null;
}

export function SavedMessagesDialog({ open, onOpenChange, currentUserId }: SavedMessagesDialogProps) {
  const { abrirChat } = useChatDock();
  const { guardados, hasMore, isLoading, isError, cargarMas, cargandoMas } = useSavedMessages(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-[96vw] max-w-[480px] flex-col gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <DialogHeader className="shrink-0 border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-bold text-on-surface">Mensajes guardados</DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            Solo tú ves estos mensajes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="px-6 py-6 text-center text-xs text-tertiary">Cargando guardados…</p>}
          {isError && <p role="alert" className="px-6 py-6 text-center text-xs text-destructive">No se pudieron cargar tus mensajes guardados.</p>}
          {!isLoading && !isError && guardados.length === 0 && (
            <p className="px-6 py-6 text-center text-xs text-tertiary">Aún no has guardado mensajes.</p>
          )}
          <ul>
            {guardados.map((item) => (
              <SavedMessageRow
                key={item.idMensaje}
                item={item}
                currentUserId={currentUserId}
                onOpen={() => {
                  abrirChat(item.conversacion.idProyecto, item.conversacion.idConversacion);
                  onOpenChange(false);
                }}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center px-6 py-3">
              <Button type="button" variant="outline" disabled={cargandoMas} onClick={cargarMas} className="h-9 gap-1.5 rounded-md border-outline-variant text-xs font-bold">
                {cargandoMas && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
