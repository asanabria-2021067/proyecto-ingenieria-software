import type { ChatConversacionGlobal } from '@/lib/types/chat';

type Silencio = Pick<ChatConversacionGlobal, 'silenciadaHasta' | 'silenciadaSiempre'>;

/** Misma regla que el backend: el silencio vence justo en `silenciadaHasta`. */
export function estaSilenciada(c: Silencio, ahora: Date = new Date()): boolean {
  if (c.silenciadaSiempre) return true;
  return !!c.silenciadaHasta && new Date(c.silenciadaHasta).getTime() > ahora.getTime();
}

/** Badge del dock: no cuenta conversaciones silenciadas. */
export function totalNoLeidos(conversaciones: (Silencio & { noLeidos: number })[], ahora: Date = new Date()): number {
  return conversaciones.reduce((total, c) => total + (estaSilenciada(c, ahora) ? 0 : c.noLeidos), 0);
}
