'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { NewChatDialog } from '@/components/chat-dock/new-chat-dialog';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/page-title';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function MensajesPage() {
  const { data: user } = useCurrentUser();
  const [nuevoChatAbierto, setNuevoChatAbierto] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-container-lowest px-6 text-center">
      <MessageCircle className="size-10 text-tertiary" aria-hidden="true" />
      <PageTitle className="text-lg font-bold text-on-surface">Tus mensajes</PageTitle>
      <p className="max-w-xs text-sm text-text-secondary">Elige una conversación de la lista o inicia un chat nuevo.</p>
      <Button type="button" className="mt-2" onClick={() => setNuevoChatAbierto(true)}>
        Nuevo chat
      </Button>
      <NewChatDialog open={nuevoChatAbierto} onOpenChange={setNuevoChatAbierto} currentUserId={user?.idUsuario ?? null} />
    </div>
  );
}
