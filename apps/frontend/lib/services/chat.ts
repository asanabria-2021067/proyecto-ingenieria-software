import { apiFetch } from '@/lib/api/client';
import type { ChatConversacion, ChatMensaje, CreateConversationPayload } from '@/lib/types/chat';

export function listConversations(idProyecto: number): Promise<ChatConversacion[]> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones`);
}

export function createConversation(
  idProyecto: number,
  payload: CreateConversationPayload,
): Promise<ChatConversacion> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMessages(
  idProyecto: number,
  idConversacion: number,
  cursor?: number,
): Promise<ChatMensaje[]> {
  const query = cursor ? `?cursor=${cursor}` : '';
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes${query}`);
}

export function sendMessage(
  idProyecto: number,
  idConversacion: number,
  contenido: string,
): Promise<ChatMensaje> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ contenido }),
  });
}

export function markConversationRead(idProyecto: number, idConversacion: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/leido`, {
    method: 'POST',
  });
}
