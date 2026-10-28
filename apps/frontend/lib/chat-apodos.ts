import type { ChatUsuario } from '@/lib/types/chat';

export function nombreReal(usuario: Pick<ChatUsuario, 'nombre' | 'apellido'>): string {
  return `${usuario.nombre} ${usuario.apellido}`.trim();
}

/** Nombre a mostrar en un chat: el apodo privado si existe, si no el nombre real. */
export function nombreMostrado(usuario: Pick<ChatUsuario, 'nombre' | 'apellido' | 'apodo'>): string {
  return usuario.apodo?.trim() || nombreReal(usuario);
}
