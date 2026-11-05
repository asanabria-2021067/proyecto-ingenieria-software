import type { QueryClient } from '@tanstack/react-query';
import type { ChatMensaje } from '@/lib/types/chat';

const esCacheDe = (idConversacion: number, seccion: string, idPadre?: number) => (query: { queryKey: readonly unknown[] }) =>
  query.queryKey[0] === 'proyecto-conversaciones' &&
  query.queryKey[2] === idConversacion &&
  query.queryKey[3] === seccion &&
  (idPadre === undefined || query.queryKey[4] === idPadre);

/** Texto del enlace bajo el mensaje original: «1 respuesta», «3 respuestas». */
export function etiquetaRespuestas(cantidad: number): string {
  return cantidad === 1 ? '1 respuesta' : `${cantidad} respuestas`;
}

function sumarRespuestas(queryClient: QueryClient, idConversacion: number, idPadre: number, delta: number) {
  queryClient.setQueriesData<ChatMensaje[]>({ predicate: esCacheDe(idConversacion, 'mensajes') }, (actual) =>
    actual?.map((m) => (m.idMensaje === idPadre ? { ...m, respuestas: Math.max(0, (m.respuestas ?? 0) + delta) } : m)),
  );
}

/**
 * Una respuesta nueva (propia o por socket) entra al hilo abierto y suma al contador del original.
 * Nunca entra a la lista del canal. Si el hilo ya la tenía (mismo mensaje por dos vías) no se cuenta dos veces.
 */
export function registrarRespuesta(queryClient: QueryClient, mensaje: ChatMensaje) {
  const idPadre = mensaje.idMensajePadre;
  if (!idPadre) return;
  let yaEstaba = false;
  queryClient.setQueriesData<ChatMensaje[]>({ predicate: esCacheDe(mensaje.idConversacion, 'hilo', idPadre) }, (actual) => {
    if (!actual) return actual;
    if (actual.some((m) => m.idMensaje === mensaje.idMensaje)) {
      yaEstaba = true;
      return actual;
    }
    return [...actual, mensaje];
  });
  if (!yaEstaba) sumarRespuestas(queryClient, mensaje.idConversacion, idPadre, 1);
}

/** Una respuesta eliminada deja de contar; su texto ya viene vacío del servidor. */
export function descontarRespuesta(queryClient: QueryClient, mensaje: ChatMensaje) {
  if (mensaje.idMensajePadre && mensaje.eliminadoEn) {
    sumarRespuestas(queryClient, mensaje.idConversacion, mensaje.idMensajePadre, -1);
  }
}
