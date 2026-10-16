import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type {
  ChatAdjuntoUrl,
  ChatArchivosPagina,
  ChatConversacion,
  ChatConversacionGlobal,
  ChatEnlacesPagina,
  ChatMensaje,
  CreateConversationPayload,
  ListArchivedConversationsFiltros,
  ListArchivedConversationsResultado,
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

export function getLinks(
  idProyecto: number,
  idConversacion: number,
  cursor?: number,
): Promise<ChatEnlacesPagina> {
  const query = cursor ? `?cursor=${cursor}` : '';
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/enlaces${query}`);
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

/** Un archivo por mensaje, con o sin texto (multipart: apiFetch no fija Content-Type). */
export function sendFileMessage(
  idProyecto: number,
  idConversacion: number,
  contenido: string,
  archivo: File,
): Promise<ChatMensaje> {
  const body = new FormData();
  if (contenido) body.append('contenido', contenido);
  body.append('file', archivo);
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes/archivo`, {
    method: 'POST',
    body,
  });
}

export function getFiles(
  idProyecto: number,
  idConversacion: number,
  cursor?: number,
): Promise<ChatArchivosPagina> {
  const query = cursor ? `?cursor=${cursor}` : '';
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/archivos${query}`);
}

/** URL firmada de vida corta: se pide al usar el archivo, nunca se guarda. */
export function getAttachmentUrl(
  idProyecto: number,
  idConversacion: number,
  idAdjunto: number,
): Promise<ChatAdjuntoUrl> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/archivos/${idAdjunto}/url`);
}

/** Bytes de la miniatura de una imagen, servidos por el backend (mismo origen). */
export function getAttachmentThumbnail(idProyecto: number, idConversacion: number, idAdjunto: number): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/archivos/${idAdjunto}/miniatura`, {
    headers: { Accept: 'image/*' },
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

export function markConversationRead(idProyecto: number, idConversacion: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/leido`, {
    method: 'POST',
  });
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
