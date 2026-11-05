/** MEJ-137: utilidades de Web Push del navegador. Nada aquí pide permisos por su cuenta. */

export const SERVICE_WORKER_PUSH = '/sw.js';

/** El navegador sabe de service workers, push y notificaciones (iOS solo con la app instalada en la pantalla de inicio). */
export function pushSoportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** La clave pública VAPID viaja en base64url; `subscribe` la pide como bytes. */
export function claveABytes(clave: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (clave.length % 4)) % 4);
  const base64 = (clave + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export interface SuscripcionNavegador {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Endpoint y llaves de una suscripción; null si el navegador no entregó las llaves. */
export function leerSuscripcion(suscripcion: PushSubscription): SuscripcionNavegador | null {
  const { endpoint, keys } = suscripcion.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}
