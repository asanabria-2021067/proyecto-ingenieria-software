import { apiFetch } from '@/lib/api/client';
import type {
  ChatConversacion,
  ChatConversacionGlobal,
  ChatLectura,
  ChatMensaje,
  CreateConversationPayload,
  DuracionSilencio,
  ListArchivedConversationsFiltros,
  ListArchivedConversationsResultado,
  PreferenciaNoMolestar,
  UpdateConversationPayload,
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

export function updateConversation(
  idProyecto: number,
  idConversacion: number,
  payload: UpdateConversationPayload,
): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function silenciarConversation(
  idProyecto: number,
  idConversacion: number,
  duracion: DuracionSilencio,
): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/silencio`, {
    method: 'PUT',
    body: JSON.stringify({ duracion }),
  });
}

export function activarSonidoConversation(idProyecto: number, idConversacion: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/silencio`, {
    method: 'DELETE',
  });
}

export function markConversationRead(idProyecto: number, idConversacion: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/leido`, {
    method: 'POST',
  });
}

export function getReadReceipts(idProyecto: number, idConversacion: number): Promise<ChatLectura[]> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/lecturas`);
}

export function deleteConversation(idProyecto: number, idConversacion: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}`, {
    method: 'DELETE',
  });
}

/** Dock global de chat: cruza todos los proyectos del usuario. */
export function listAllConversations(q?: string): Promise<ChatConversacionGlobal[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch(`/chats${params}`);
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

export function getNoMolestar(): Promise<PreferenciaNoMolestar> {
  return apiFetch('/chats/no-molestar');
}

export function updateNoMolestar(payload: PreferenciaNoMolestar): Promise<PreferenciaNoMolestar> {
  return apiFetch('/chats/no-molestar', { method: 'PUT', body: JSON.stringify(payload) });
}
