import { MessageCircle } from 'lucide-react';

export default function MensajesPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-container-lowest px-6 text-center">
      <MessageCircle className="size-10 text-tertiary" aria-hidden="true" />
      <h1 className="text-lg font-bold text-on-surface">Tus mensajes</h1>
      <p className="max-w-xs text-sm text-text-secondary">Elige una conversación de la lista o inicia un chat nuevo.</p>
    </div>
  );
}
