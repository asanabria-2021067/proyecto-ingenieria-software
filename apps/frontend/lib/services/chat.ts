import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type {
  ChatAdjuntoUrl,
  ChatArchivosPagina,
  BuscarMensajesFiltros,
  BuscarMensajesResultado,
  ChatConversacion,
  ChatConversacionGlobal,
  ChatLectura,
  ChatEnlacesPagina,
  ChatMensaje,
  ChatReaccion,
  CreateConversationPayload,
  DuracionSilencio,
  ListArchivedConversationsFiltros,
  ListArchivedConversationsResultado,
  ConfigNoMolestar,
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

export function searchMessages(
  idProyecto: number,
  idConversacion: number,
  filtros: BuscarMensajesFiltros,
): Promise<BuscarMensajesResultado> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.idAutor) params.set('idAutor', String(filtros.idAutor));
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes/buscar?${params.toString()}`);
}

export function sendMessage(
  idProyecto: number,
  idConversacion: number,
  contenido: string,
  idMensajeCitado?: number,
): Promise<ChatMensaje> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ contenido, idMensajeCitado }),
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

export function toggleReaction(
  idProyecto: number,
  idConversacion: number,
  idMensaje: number,
  emoji: string,
): Promise<ChatReaccion[]> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes/${idMensaje}/reacciones`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
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

export function setApodo(
  idProyecto: number,
  idConversacion: number,
  idObjetivo: number,
  apodo: string,
): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/apodos/${idObjetivo}`, {
    method: 'PUT',
    body: JSON.stringify({ apodo }),
  });
}

export function removeApodo(idProyecto: number, idConversacion: number, idObjetivo: number): Promise<void> {
  return apiFetch(`/proyectos/${idProyecto}/conversaciones/${idConversacion}/apodos/${idObjetivo}`, {
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

export function getNoMolestar(): Promise<ConfigNoMolestar> {
  return apiFetch('/chats/no-molestar');
}

export function updateNoMolestar(payload: ConfigNoMolestar): Promise<ConfigNoMolestar> {
  // El GET trae campos de solo lectura (enHorarioAhora) que el DTO rechaza: se envian solo los escribibles.
  const { activo, horaInicio, horaFin, diasSemana, zona } = payload;
  return apiFetch('/chats/no-molestar', {
    method: 'PUT',
    body: JSON.stringify({ activo, horaInicio, horaFin, diasSemana, zona }),
  });
}
