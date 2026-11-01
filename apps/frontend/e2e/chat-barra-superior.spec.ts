import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';
import { asegurarChatCon, iconoMensajes } from './support/chat';

// NL-T5 / CHAT-PAGE: el icono de la barra superior (junto a la campana) lleva a /dashboard/mensajes,
// con contador en vivo; el botón flotante queda solo en pantallas angostas.
const PROYECTO_ID = 1;
const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const JOSE = 'jose.ramirez@uvg.edu.gt';

/** Mensajes sin leer que anuncia el icono (0 si no anuncia ninguno). */
async function sinLeer(page: Page): Promise<number> {
  const nombre = (await iconoMensajes(page).getAttribute('aria-label')) ?? '';
  return Number(/(\d+) sin leer/.exec(nombre)?.[1] ?? 0);
}

test('el icono de la barra superior abre el chat con un clic y su contador baja al leer', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, CARLOS);
    await login(pageB, JOSE);
    await pageA.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
    await asegurarChatCon(pageA, 'José');

    // José llega al dashboard: el icono está junto a la campana, con tooltip, y el botón flotante no se ve.
    await pageB.goto('/dashboard');
    await expect(iconoMensajes(pageB)).toBeVisible();
    await expect(iconoMensajes(pageB)).toHaveAttribute('title', 'Mensajes');
    await expect(pageB.getByRole('button', { name: /^notificaciones/i })).toHaveAttribute('title', 'Notificaciones');
    await expect(iconoMensajes(pageB)).toHaveCount(1);
    const antes = await sinLeer(pageB);

    // Carlos escribe: el contador de José sube sin recargar.
    const mensaje = `BarraSuperior ${Math.random().toString(36).slice(2)}`;
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();
    await expect.poll(() => sinLeer(pageB), { timeout: 15_000 }).toBeGreaterThan(antes);
    const conMensaje = await sinLeer(pageB);

    // Un clic lleva a la página de mensajes; al abrir la conversación y leerla, el contador baja.
    await iconoMensajes(pageB).click();
    await expect(pageB).toHaveURL(/\/dashboard\/mensajes$/);
    await pageB.getByRole('button', { name: /Carlos/ }).first().click();
    await expect(pageB).toHaveURL(/\/dashboard\/mensajes\/\d+$/);
    await expect(pageB.getByText(mensaje).first()).toBeVisible();
    await expect.poll(() => sinLeer(pageB), { timeout: 15_000 }).toBeLessThan(conMensaje);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('el ítem «Mensajes» de la barra lateral lleva a la página de mensajes', async ({ page }) => {
  await desactivarTour(page);
  await login(page, JOSE);

  await page.locator('#nav-item-mensajes').click();
  await expect(page).toHaveURL(/\/dashboard\/mensajes$/);
  await expect(page.getByPlaceholder('Buscar mensajes')).toBeVisible();
  await expect(page.getByRole('button', { name: /nuevo chat/i })).toBeVisible();
});

test('«Chat del equipo» del menú del proyecto abre la conversación de #general', async ({ page }) => {
  await desactivarTour(page);
  await login(page, CARLOS);
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

  await page.getByRole('button', { name: 'Chat del equipo' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar chat' })).toBeVisible();
  await expect(page.getByText('#general').first()).toBeVisible();
});

test('en pantalla angosta el botón flotante «Mensajes» reemplaza al icono de la barra', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await desactivarTour(page);
  try {
    await login(page, JOSE);
    await page.goto('/dashboard');
    const flotante = page.getByRole('button', { name: /^mensajes/i });
    await expect(flotante).toHaveCount(1);
    await flotante.click();
    await expect(page.getByRole('button', { name: /nuevo chat/i })).toBeVisible();
  } finally {
    await context.close();
  }
});
