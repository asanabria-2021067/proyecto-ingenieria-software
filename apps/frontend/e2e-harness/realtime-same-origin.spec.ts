import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * G07-C12 · T14 (P2 + OWASP25-C025), tramo de navegador. Contra el nginx del
 * arnés efímero y su frontend construido con la variante same-origin: el
 * dashboard abre el socket de notificaciones en wss://<mismo origen>/socket.io/
 * con la cookie httpOnly, recibe `connected` y NINGUNA petición del navegador
 * va a :3001 ni a la IP de la API. La sesión es la de un usuario sintético que
 * realtime.mjs deja en un archivo temporal del arnés (nunca se imprime).
 */

const BASE_URL = process.env.HARNESS_BASE_URL ?? '';
const SESSION_FILE = process.env.HARNESS_BROWSER_SESSION ?? '';
const FORBIDDEN = [':3001', '158.23.57.118'];

test('T14-B: el navegador usa solo el mismo origen para HTTP y Socket.IO', async ({ page, context }) => {
  const base = new URL(BASE_URL);
  expect(['localhost', '127.0.0.1']).toContain(base.hostname);
  const session = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { access: string; refresh: string };
  await context.addCookies(
    (['access_token', 'refresh_token'] as const).map((name) => ({
      name,
      value: name === 'access_token' ? session.access : session.refresh,
      domain: base.hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
    })),
  );

  const requests: string[] = [];
  const sockets: string[] = [];
  const frames: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (socket) => {
    sockets.push(socket.url());
    socket.on('framereceived', ({ payload }) => frames.push(String(payload)));
  });

  await page.goto('/dashboard');
  await expect.poll(() => frames.some((frame) => frame.startsWith('42/notifications,["connected"')), { timeout: 30_000 }).toBe(true);

  expect(sockets.length).toBeGreaterThan(0);
  for (const url of sockets) {
    expect(url.startsWith(`wss://${base.host}/socket.io/`)).toBe(true);
  }
  for (const url of requests) {
    for (const pattern of FORBIDDEN) {
      expect(url).not.toContain(pattern);
    }
    if (url.startsWith('http')) {
      expect(new URL(url).host).toBe(base.host);
    }
  }
});
