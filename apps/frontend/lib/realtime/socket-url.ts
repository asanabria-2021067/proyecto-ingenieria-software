/**
 * G07 (P2/T12): base del Socket.IO del navegador, compartida por las
 * notificaciones y el chat.
 *
 * - `NEXT_PUBLIC_API_URL` horneada vacía (variante same-origin de deploy.yml,
 *   `PUBLIC_API_URL=same-origin`): el socket usa el origen de la página y viaja
 *   por la ruta /socket.io/ de nginx (P1). Nunca la IP ni el puerto :3001.
 * - URL explícita (comportamiento previo a P4): esa URL con el esquema ws/wss
 *   de la página. Si la página es https y la URL quedó en http, un ws://
 *   literal sería mixed content y el navegador lo bloquearía.
 * - Sin variable: en desarrollo, el backend local en :3001; en un build de
 *   producción, el mismo origen, igual que el cliente HTTP (lib/api/client.ts).
 */
export function realtimeBaseUrl(
  configuredApiUrl: string | undefined,
  page: Pick<Location, 'origin' | 'protocol'>,
): string {
  const apiUrl = configuredApiUrl ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
  if (!apiUrl) {
    return page.origin;
  }
  const wsScheme = page.protocol === 'https:' ? 'wss' : 'ws';
  return apiUrl.replace(/^https?/, wsScheme);
}
