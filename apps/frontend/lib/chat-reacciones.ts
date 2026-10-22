import type { ChatReaccion, ChatReaccionSocket } from '@/lib/types/chat';

// Misma lista corta que acepta el backend (en escapes unicode): pulgar arriba, corazon, risa, fiesta, sorpresa, tristeza, gracias, ojos.
export const EMOJIS_REACCION = [
  '\u{1F44D}',
  '❤️',
  '\u{1F602}',
  '\u{1F389}',
  '\u{1F62E}',
  '\u{1F622}',
  '\u{1F64F}',
  '\u{1F440}',
];

/** Actualizacion optimista: agrega o quita la reaccion propia sin esperar al servidor. */
export function alternarReaccionLocal(reacciones: ChatReaccion[] = [], emoji: string): ChatReaccion[] {
  const actual = reacciones.find((r) => r.emoji === emoji);
  if (!actual) return [...reacciones, { emoji, count: 1, reaccionadoPorMi: true }];
  if (!actual.reaccionadoPorMi) {
    return reacciones.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reaccionadoPorMi: true } : r));
  }
  if (actual.count <= 1) return reacciones.filter((r) => r.emoji !== emoji);
  return reacciones.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reaccionadoPorMi: false } : r));
}

/** El evento de socket trae los ids de quienes reaccionaron; cada cliente deriva el suyo. */
export function reaccionesDesdeSocket(grupos: ChatReaccionSocket[], idUsuario?: number): ChatReaccion[] {
  return grupos.map(({ emoji, count, idsUsuarios }) => ({
    emoji,
    count,
    reaccionadoPorMi: idUsuario !== undefined && idsUsuarios.includes(idUsuario),
  }));
}
