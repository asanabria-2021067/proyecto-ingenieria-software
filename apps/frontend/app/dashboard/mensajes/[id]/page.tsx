'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RUTA_MENSAJES } from '@/components/chat-dock/chat-dock-context';
import { useChatSocket } from '@/components/chat-dock/chat-dock';
import { ChatWindow } from '@/components/chat-dock/chat-window';
import { useAllConversations } from '@/hooks/use-chat';
import { SkeletonList } from '@/components/ui/skeleton';

export default function MensajesConversacionPage() {
  const router = useRouter();
  const idConversacion = Number(useParams<{ id: string }>().id);
  const { conversations, isLoading } = useAllConversations();
  const { typingByConversation, emitTyping } = useChatSocket();
  const conversacion = conversations.find((c) => c.idConversacion === idConversacion);

  if (!conversacion) {
    return isLoading ? (
      <SkeletonList label="Cargando conversación" count={4} lines={2} avatar="circle" layout="plain" className="px-4 py-stack" />
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-text-secondary">Esta conversación no existe o ya no tienes acceso.</p>
        <Link href={RUTA_MENSAJES} className="text-sm font-semibold text-primary hover:underline">
          Volver a mensajes
        </Link>
      </div>
    );
  }

  return (
    <ChatWindow
      key={idConversacion}
      variante="pagina"
      idProyecto={conversacion.idProyecto}
      idConversacion={idConversacion}
      minimized={false}
      onMinimize={() => {}}
      onClose={() => router.push(RUTA_MENSAJES)}
      typingUserIds={typingByConversation[idConversacion]}
      onTyping={() => emitTyping(idConversacion)}
    />
  );
}
