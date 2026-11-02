import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { ChatEncuesta, ChatMensaje, ChatTarjetaEnlace, CrearEncuestaPayload } from '@/lib/types/chat';

const base = (idProyecto: number, idConversacion: number) => `/proyectos/${idProyecto}/conversaciones/${idConversacion}`;

/** Nota de voz (MEJ-41): multipart con el audio y su duración en segundos. */
export function sendVoiceNote(idProyecto: number, idConversacion: number, audio: Blob, duracionSegundos: number): Promise<ChatMensaje> {
  const body = new FormData();
  body.append('duracionSegundos', String(duracionSegundos));
  body.append('file', audio, 'nota-de-voz');
  return apiFetch(`${base(idProyecto, idConversacion)}/mensajes/voz`, { method: 'POST', body });
}

/** Bytes del audio, servidos por el backend (mismo origen): se reproducen desde un objectURL. */
export function getVoiceNoteAudio(idProyecto: number, idConversacion: number, idAdjunto: number): Promise<Blob> {
  return apiFetchBlob(`${base(idProyecto, idConversacion)}/archivos/${idAdjunto}/audio`, { headers: { Accept: 'audio/*' } });
}

export function createPoll(idProyecto: number, idConversacion: number, payload: CrearEncuestaPayload): Promise<ChatMensaje> {
  return apiFetch(`${base(idProyecto, idConversacion)}/encuestas`, { method: 'POST', body: JSON.stringify(payload) });
}

/** Reemplaza los votos propios; `[]` retira el voto. */
export function votePoll(idProyecto: number, idConversacion: number, idMensaje: number, idsOpciones: number[]): Promise<ChatEncuesta> {
  return apiFetch(`${base(idProyecto, idConversacion)}/mensajes/${idMensaje}/voto`, {
    method: 'PUT',
    body: JSON.stringify({ idsOpciones }),
  });
}

export function closePoll(idProyecto: number, idConversacion: number, idMensaje: number): Promise<ChatEncuesta> {
  return apiFetch(`${base(idProyecto, idConversacion)}/mensajes/${idMensaje}/encuesta/cierre`, { method: 'POST' });
}

/** MEJ-45: resuelve rutas internas a tarjetas con los permisos de quien lee. */
export function resolveCards(idProyecto: number, idConversacion: number, rutas: string[]): Promise<ChatTarjetaEnlace[]> {
  return apiFetch(`${base(idProyecto, idConversacion)}/tarjetas`, { method: 'POST', body: JSON.stringify({ rutas }) });
}

/** MEJ-46: «Recuérdamelo»; volver a pedirlo cambia la hora del recordatorio pendiente. */
export function createReminder(idProyecto: number, idConversacion: number, idMensaje: number, recordarEn: string): Promise<{ idRecordatorio: number; recordarEn: string }> {
  return apiFetch(`${base(idProyecto, idConversacion)}/mensajes/${idMensaje}/recordatorio`, { method: 'POST', body: JSON.stringify({ recordarEn }) });
}

/** Mensajes fijados (MEJ-43). */
export function getPinned(idProyecto: number, idConversacion: number): Promise<ChatMensaje[]> {
  return apiFetch(`${base(idProyecto, idConversacion)}/fijados`);
}

export function setPinned(idProyecto: number, idConversacion: number, idMensaje: number, fijar: boolean): Promise<ChatMensaje> {
  return apiFetch(`${base(idProyecto, idConversacion)}/mensajes/${idMensaje}/fijado`, { method: fijar ? 'PUT' : 'DELETE' });
}

/** Fijados del chat de la organización: solo Propietario y Administradores fijan; cualquier miembro lee. */
export function getPinnedOrganizacion(idOrganizacion: number): Promise<ChatMensaje[]> {
  return apiFetch(`/organizaciones/${idOrganizacion}/chat/fijados`);
}

export function setPinnedOrganizacion(idOrganizacion: number, idMensaje: number, fijar: boolean): Promise<ChatMensaje> {
  return apiFetch(`/organizaciones/${idOrganizacion}/chat/mensajes/${idMensaje}/fijado`, { method: fijar ? 'PUT' : 'DELETE' });
}
