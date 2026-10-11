import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

/**
 * GPI01: utilidades comunes de los E2E de tiempo real. Todo corre contra el
 * backend real de la pila aislada; nada del socket ni de la API se simula.
 */
export const API_URL = process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * OnboardingTour (react-joyride) se activa por localStorage en un contexto
 * nuevo y su overlay intercepta clics: cualquier lectura de una clave
 * `onboarding_seen_*` responde 'true' desde antes del primer script.
 */
export async function desactivarTour(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

/** Socket autenticado como el usuario del contexto, igual que el navegador: con su cookie de sesión. */
export async function socketDe(context: BrowserContext, namespace: '/notifications' | '/chat'): Promise<Socket> {
  const cookies = await context.cookies(API_URL);
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const socket = io(`${API_URL}${namespace}`, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie },
    reconnection: false,
    // socket.io-client reutiliza por host el gestor de la primera conexión, con SUS
    // cabeceras: sin esto, un socket podría viajar con la cookie de otro usuario.
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connected', () => resolve());
    socket.once('connect_error', reject);
    socket.once('disconnect', () => reject(new Error(`socket ${namespace} rechazado`)));
  });
  return socket;
}

/**
 * Lee el contador de no leídas. La API limita las peticiones por IP y varios
 * paneles cargando a la vez la saturan: un 429 se reintenta, no se esquiva.
 */
export async function noLeidas(page: Page): Promise<number> {
  let total = -1;
  await expect(async () => {
    const response = await page.request.get(`${API_URL}/api/notificaciones/mias/conteo-no-leidas`);
    expect(response.status(), 'conteo de no leídas').toBe(200);
    total = ((await response.json()) as { total: number }).total;
  }).toPass({ timeout: 20_000 });
  return total;
}
