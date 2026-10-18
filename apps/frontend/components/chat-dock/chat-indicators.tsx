'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getIniciales } from '@/components/projects/available-project-card';
import type { ChatLectura, ChatMensaje, ChatUsuario } from '@/lib/types/chat';

const MAX_AVATARES = 3;

/** Quienes leyeron la conversación hasta `mensaje` (inclusive), sin contar a quien lo envió. */
export function quienesVieron(lecturas: ChatLectura[], participantes: ChatUsuario[], mensaje: ChatMensaje): ChatUsuario[] {
  const enviado = new Date(mensaje.enviadoEn).getTime();
  const vieron = new Set(
    lecturas
      .filter((l) => l.ultimaLecturaEn && new Date(l.ultimaLecturaEn).getTime() >= enviado)
      .map((l) => l.idUsuario),
  );
  return participantes.filter((p) => p.idUsuario !== mensaje.remitente.idUsuario && vieron.has(p.idUsuario));
}

export function textoVistoPor(vieron: ChatUsuario[]): string {
  const nombres = vieron.map((u) => u.nombre);
  if (nombres.length <= 2) return `Visto por ${nombres.join(' y ')}`;
  return `Visto por ${nombres[0]} y ${nombres.length - 1} más`;
}

/** Bajo el último mensaje propio: avatares/iniciales de quienes ya lo vieron, con texto visible. */
export function SeenBy({ vieron }: { vieron: ChatUsuario[] }) {
  if (vieron.length === 0) return null;
  return (
    <div className="flex items-center justify-end gap-1 pr-8" data-testid="chat-visto-por">
      <span className="flex -space-x-1" aria-hidden="true">
        {vieron.slice(0, MAX_AVATARES).map((u) => (
          <Avatar key={u.idUsuario} className="size-4 border border-surface-container-lowest">
            {u.fotoUrl && <AvatarImage src={u.fotoUrl} alt="" />}
            <AvatarFallback className="text-[8px]">{getIniciales(u.nombre, u.apellido)}</AvatarFallback>
          </Avatar>
        ))}
      </span>
      <span className="text-[10px] text-tertiary">{textoVistoPor(vieron)}</span>
    </div>
  );
}

export function textoEscribiendo(nombres: string[]): string {
  if (nombres.length === 0) return '';
  if (nombres.length === 1) return `${nombres[0]} está escribiendo…`;
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]} están escribiendo…`;
  return 'Varias personas están escribiendo…';
}

/** Región en vivo siempre montada: los lectores de pantalla anuncian el texto cuando aparece. */
export function TypingIndicator({ nombres }: { nombres: string[] }) {
  return (
    <p role="status" aria-live="polite" className="min-h-4 px-3 pb-1 text-[11px] italic text-tertiary">
      {textoEscribiendo(nombres)}
    </p>
  );
}
