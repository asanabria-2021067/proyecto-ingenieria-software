import type { WebSocketRoute } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour, noLeidas, socketDe } from './support/realtime';

/**
 * GPI01-C02 (H-01): el tiempo real conecta desde un navegador real con la
 * sesión de la cookie, se recupera de un corte del WebSocket sin perder la
 * sesión, rechaza conexiones sin sesión, entrega solo al destinatario y, sin
 * socket, la lectura por HTTP sigue funcionando.
 *
 * Todo espera por eventos (estado del indicador, eventos del socket), nunca
 * por tiempos fijos. Escribe un comentario: corre solo contra la pila E2E
 * aislada (scripts/e2e/isolated-stack.sh), igual que el resto de ./e2e.
 */

const SOCKET_URL = /\/socket\.io\//;

const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CORREO_ASIGNADA = 'maria.lopez@uvg.edu.gt';
const CORREO_TERCERO = 'jose.ramirez@uvg.edu.gt';
const PROYECTO_ID = 1;
const TAREA_ID = 1;

const NOTIFICACIONES_OK = 'Notificaciones en vivo conectadas';
const NOTIFICACIONES_CAIDAS = 'Reconectando notificaciones en vivo';
const CHAT_OK = 'Chat en vivo conectado';

test.describe('GPI01-C02: conexión en tiempo real', () => {
  test('con sesión, notificaciones y chat conectan por un WebSocket real al backend', async ({ page }) => {
    const sockets: { url: string; recibidas: number }[] = [];
    page.on('websocket', (ws) => {
      const registro = { url: ws.url(), recibidas: 0 };
      sockets.push(registro);
      ws.on('framereceived', () => registro.recibidas++);
    });
    await desactivarTour(page);
    await login(page, CORREO_LIDER);
    await page.goto('/dashboard');

    await expect(page.getByLabel(NOTIFICACIONES_OK)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(CHAT_OK)).toBeVisible({ timeout: 20_000 });

    // El indicador no basta: debe existir un WebSocket contra el backend con tramas recibidas.
    await expect.poll(() => sockets.some((s) => s.recibidas > 0)).toBe(true);
    const backend = new URL(API_URL);
    for (const socket of sockets) {
      expect(new URL(socket.url).host, 'el socket va al backend, no al frontend').toBe(backend.host);
    }
  });

  test('tras un corte del WebSocket reconecta sin perder la sesión ni entrar en bucle', async ({ page }) => {
    const enlaces: WebSocketRoute[] = [];
    await page.routeWebSocket(SOCKET_URL, (ws) => {
      ws.connectToServer();
      enlaces.push(ws);
    });
    await desactivarTour(page);
    await login(page, CORREO_LIDER);
    await page.goto('/dashboard');
    await expect(page.getByLabel(NOTIFICACIONES_OK)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(CHAT_OK)).toBeVisible({ timeout: 20_000 });

    const antes = enlaces.length;
    await Promise.all(enlaces.map((ws) => ws.close()));

    // La interfaz reconoce el corte y se recupera sola, sin recargar la página.
    await expect(page.getByLabel(NOTIFICACIONES_OK)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(CHAT_OK)).toBeVisible({ timeout: 30_000 });
    expect(enlaces.length, 'se abrieron conexiones nuevas tras el corte').toBeGreaterThan(antes);

    // Sin bucle: una reconexión por socket cortado, no una ráfaga.
    expect(enlaces.length - antes).toBeLessThanOrEqual(antes);
    // La sesión sigue viva: misma página y la API autenticada responde.
    expect(new URL(page.url()).pathname).toBe('/dashboard');
    expect(await noLeidas(page)).toBeGreaterThanOrEqual(0);
  });

  test('sin sesión el backend cierra el socket y nunca confirma la conexión', async () => {
    for (const namespace of ['/notifications', '/chat'] as const) {
      // forceNew: sin él se reutiliza el gestor que otra suite abrió con la cookie de un usuario,
      // y este socket dejaría de ser anónimo.
      const socket = io(`${API_URL}${namespace}`, { transports: ['websocket'], reconnection: false, forceNew: true });
      let confirmado = false;
      socket.on('connected', () => (confirmado = true));
      // El backend corta durante el saludo: según el instante, el cliente lo ve como
      // `disconnect`, como `connect_error` o solo como cierre del transporte.
      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.once('connect_error', () => resolve());
        socket.io.once('close', () => resolve());
      });
      expect(confirmado, `${namespace} no debe confirmar a un anónimo`).toBe(false);
      expect(socket.connected).toBe(false);
      socket.close();
    }
  });

  test('una notificación llega solo a su destinatario, no a otro usuario conectado', async ({ browser }) => {
    test.setTimeout(90_000);
    const lider = await browser.newContext();
    const asignada = await browser.newContext();
    const tercero = await browser.newContext();
    const sockets: Socket[] = [];
    try {
      const pageLider = await lider.newPage();
      const pageAsignada = await asignada.newPage();
      const pageTercero = await tercero.newPage();
      for (const p of [pageLider, pageAsignada, pageTercero]) await desactivarTour(p);
      // Cada panel termina de cargar antes de abrir el siguiente: los tres
      // comparten IP y juntos superan el límite de peticiones por segundo.
      for (const [p, correo] of [
        [pageLider, CORREO_LIDER],
        [pageAsignada, CORREO_ASIGNADA],
        [pageTercero, CORREO_TERCERO],
      ] as const) {
        await login(p, correo);
        await p.waitForLoadState('networkidle');
      }

      const socketAsignada = await socketDe(asignada, '/notifications');
      const socketTercero = await socketDe(tercero, '/notifications');
      sockets.push(socketAsignada, socketTercero);
      const recibidasTercero: unknown[] = [];
      socketTercero.on('notification', (n) => recibidasTercero.push(n));
      const llegada = new Promise<{ tituloNotificacion?: string; mensajeNotificacion?: string }>((resolve) =>
        socketAsignada.once('notification', resolve),
      );
      const noLeidasTerceroAntes = await noLeidas(pageTercero);
      const noLeidasAsignadaAntes = await noLeidas(pageAsignada);

      await pageLider.goto(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}?section=comments`);
      const comentario = `Tiempo real ${test.info().workerIndex}-${Math.random().toString(36).slice(2)}`;
      await pageLider.getByPlaceholder('Escribe un comentario...').fill(comentario);
      await pageLider.getByRole('button', { name: 'Comentar', exact: true }).click();
      await expect(pageLider.getByText(comentario).first()).toBeVisible();

      const notificacion = await llegada;
      expect(notificacion.tituloNotificacion).toBe('Nuevo comentario');

      // Persistencia real: sube el contador de la destinataria y el del tercero no cambia.
      await expect.poll(() => noLeidas(pageAsignada)).toBe(noLeidasAsignadaAntes + 1);
      expect(await noLeidas(pageTercero)).toBe(noLeidasTerceroAntes);
      expect(recibidasTercero, 'el tercero no recibe la notificación ajena').toEqual([]);
      expect(socketTercero.connected, 'el tercero seguía conectado mientras tanto').toBe(true);
    } finally {
      for (const socket of sockets) socket.close();
      await Promise.all([lider.close(), asignada.close(), tercero.close()]);
    }
  });

  test('sin tiempo real la lectura por HTTP sigue funcionando', async ({ page }) => {
    // Ni WebSocket ni long-polling: el socket no puede conectar de ninguna forma.
    await page.route(SOCKET_URL, (route) => route.abort());
    await page.routeWebSocket(SOCKET_URL, (ws) => ws.close());
    await desactivarTour(page);
    await login(page, CORREO_ASIGNADA);
    await page.goto('/dashboard/notificaciones');

    await expect(page.getByLabel(NOTIFICACIONES_CAIDAS)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();
    const lista = await page.request.get(`${API_URL}/api/notificaciones`);
    expect(lista.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/dashboard/notificaciones');
  });
});
