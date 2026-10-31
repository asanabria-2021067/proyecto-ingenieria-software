'use client';

import { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { listConversations } from '@/lib/services/chat';

/**
 * «Chat del equipo»: abre directo la conversación grupal del proyecto (el canal
 * #general; si no existe, el primer grupo). Pide la lista al hacer clic, así no
 * cuesta una consulta por cada proyecto abierto.
 */
export function ChatEquipoButton({
  idProyecto,
  variante = 'etiqueta',
  className,
  onAbrir,
}: {
  idProyecto: number;
  variante?: 'etiqueta' | 'icono';
  className?: string;
  onAbrir?: () => void;
}) {
  const { abrirChat } = useChatDock();
  const [cargando, setCargando] = useState(false);

  const abrir = async () => {
    if (cargando) return;
    setCargando(true);
    try {
      const conversaciones = await listConversations(idProyecto);
      const equipo = conversaciones.find((c) => c.esCanal && c.nombre === 'general') ?? conversaciones.find((c) => c.tipo === 'GRUPAL');
      if (!equipo) {
        toast.error('Este proyecto todavía no tiene un chat del equipo.');
        return;
      }
      abrirChat(idProyecto, equipo.idConversacion);
      onAbrir?.();
    } catch {
      toast.error('No se pudo abrir el chat del equipo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <button type="button" onClick={abrir} disabled={cargando} aria-label="Chat del equipo" title="Chat del equipo" className={className}>
      <MessagesSquare className="size-4" aria-hidden="true" />
      {variante === 'etiqueta' && 'Chat del equipo'}
    </button>
  );
}
