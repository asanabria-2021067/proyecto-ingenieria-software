import type { QueryClient } from '@tanstack/react-query';
import type { ChatEncuesta, ChatMensaje } from '@/lib/types/chat';

/** Misma raíz que las claves de mensajes: el socket global actualiza por `idConversacion` (idProyecto 0 = organización). */
export const fijadosQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'fijados'] as const;

const esCacheDe = (idConversacion: number, seccion: string) => (query: { queryKey: readonly unknown[] }) =>
  query.queryKey[0] === 'proyecto-conversaciones' && query.queryKey[2] === idConversacion && query.queryKey[3] === seccion;

/** Resultados nuevos de una encuesta (voto propio o ajeno por socket) en todas las cachés de esa conversación. */
export function actualizarEncuestaEnCache(queryClient: QueryClient, idConversacion: number, idMensaje: number, encuesta: ChatEncuesta) {
  for (const seccion of ['mensajes', 'fijados']) {
    queryClient.setQueriesData<ChatMensaje[]>({ predicate: esCacheDe(idConversacion, seccion) }, (actual) =>
      actual?.map((m) => (m.idMensaje === idMensaje ? { ...m, encuesta } : m)),
    );
  }
}

/** Un mensaje se fijó o desfijó (o cambió): la barra de fijados se vuelve a pedir. */
export function refrescarFijados(queryClient: QueryClient, idConversacion: number) {
  queryClient.invalidateQueries({ predicate: esCacheDe(idConversacion, 'fijados') });
}

export const NOTA_VOZ_MAX_SEGUNDOS = 120;
export const NOTA_VOZ_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FIJADOS = 3;
export const ENCUESTA_MIN_OPCIONES = 2;
export const ENCUESTA_MAX_OPCIONES = 6;

/** m:ss, para el temporizador de la grabación y la duración del reproductor. */
export function formatearDuracion(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Formato de grabación que este navegador sabe producir y el servidor acepta; undefined = sin MediaRecorder. */
export function formatoGrabacion(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
}

export function encuestaCerrada(encuesta: ChatEncuesta, ahora: number = Date.now()): boolean {
  return encuesta.cerradaEn !== null || (encuesta.cierraEn !== null && new Date(encuesta.cierraEn).getTime() <= ahora);
}

export function totalVotos(encuesta: ChatEncuesta): number {
  return encuesta.opciones.reduce((suma, o) => suma + o.votos.length, 0);
}

/** Personas distintas que votaron (en voto múltiple una persona puede tener varios votos). */
export function totalVotantes(encuesta: ChatEncuesta): number {
  return new Set(encuesta.opciones.flatMap((o) => o.votos.map((v) => v.idUsuario))).size;
}

export function porcentajeOpcion(encuesta: ChatEncuesta, idOpcion: number): number {
  const votantes = totalVotantes(encuesta);
  if (votantes === 0) return 0;
  const opcion = encuesta.opciones.find((o) => o.idOpcion === idOpcion);
  return Math.round(((opcion?.votos.length ?? 0) / votantes) * 100);
}

export function misVotos(encuesta: ChatEncuesta, idUsuario: number | null): number[] {
  if (idUsuario === null) return [];
  return encuesta.opciones.filter((o) => o.votos.some((v) => v.idUsuario === idUsuario)).map((o) => o.idOpcion);
}

/** Resumen en texto plano de un mensaje para listas y barras (fijados, vistas previas). */
export function resumenMensaje(m: Pick<ChatMensaje, 'contenido' | 'adjunto' | 'encuesta'>): string {
  if (m.encuesta) return `Encuesta: ${m.encuesta.pregunta}`;
  if (m.adjunto?.duracionSegundos) return `Nota de voz (${formatearDuracion(m.adjunto.duracionSegundos)})`;
  if (m.adjunto) return m.contenido.trim() || m.adjunto.nombreOriginal;
  return m.contenido.replace(/\s+/g, ' ').trim();
}
