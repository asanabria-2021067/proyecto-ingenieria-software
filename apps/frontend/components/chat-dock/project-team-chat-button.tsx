'use client';

import { useState } from 'react';
import { Loader2, MessagesSquare } from 'lucide-react';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { listChannels } from '@/lib/services/chat';
import { aviso } from '@/lib/mensajes';
import { cn } from '@/lib/utils';

interface ProjectTeamChatButtonProps {
  idProyecto: number;
  /** `sidebar`: fila completa al pie de la sidebar; `compact`: solo icono (sidebar colapsada); `bar`: barra de tablet (md–lg). */
  variant: 'sidebar' | 'compact' | 'bar';
  className?: string;
}

/**
 * IESUC-568 (B2, NeuroLab): acceso fijo al chat del equipo desde la vista del
 * proyecto. No crea otra ventana de chat: abre el canal `#general` del
 * proyecto en el mismo dock «Mensajes» (useChatDock().abrirChat). El canal lo
 * asegura el backend al listarlo, así que también existe en proyectos nuevos.
 */
export function ProjectTeamChatButton({ idProyecto, variant, className }: ProjectTeamChatButtonProps) {
  const { abrirChat } = useChatDock();
  const [abriendo, setAbriendo] = useState(false);

  const abrir = async () => {
    setAbriendo(true);
    try {
      const general = (await listChannels(idProyecto)).find((canal) => canal.esGeneral);
      if (general) {
        abrirChat(idProyecto, general.idConversacion);
      } else {
        aviso.error('No se encontró el chat del equipo', 'Vuelve a intentarlo en unos segundos.');
      }
    } catch {
      aviso.error('No se pudo abrir el chat del equipo', 'Vuelve a intentarlo en unos segundos.');
    } finally {
      setAbriendo(false);
    }
  };

  const Icono = abriendo ? Loader2 : MessagesSquare;
  const icono = <Icono className={cn('size-4 shrink-0', abriendo && 'animate-spin')} aria-hidden="true" />;

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={abrir}
        disabled={abriendo}
        aria-label="Chat del equipo"
        title="Chat del equipo"
        className={cn(
          'flex size-8 items-center justify-center rounded-control bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-70',
          className,
        )}
      >
        {icono}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abriendo}
      className={cn(
        'flex items-center gap-2 rounded-control bg-primary font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-70',
        // El dock «Mensajes» solo existe desde md (ChatDock): en teléfono no habría dónde abrirlo.
        variant === 'sidebar' ? 'w-full px-2 py-2 text-sm' : 'hidden h-8 shrink-0 px-3 text-xs md:flex',
        className,
      )}
    >
      {icono}
      Chat del equipo
    </button>
  );
}
