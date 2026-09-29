import { apiFetch } from '@/lib/api/client';
import type {
  ChatConversacion,
  ChatMensaje,
  CreateConversationPayload,
  ListArchivedConversationsFiltros,
  ListArchivedConversationsResultado,
} from '@/lib/types/chat';

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

/** T-236: cruza todos los proyectos del usuario, no uno solo. */
export function listArchivedConversations(
  filtros: ListArchivedConversationsFiltros,
): Promise<ListArchivedConversationsResultado> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.page) params.set('page', String(filtros.page));
  return apiFetch(`/chats/archivados?${params.toString()}`);
}
