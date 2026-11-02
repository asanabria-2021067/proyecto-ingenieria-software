import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';
import { asegurarChatCon, iconoMensajes } from './support/chat';

// CHAT-PAGE: /dashboard/mensajes con lista a la izquierda y la conversación a la derecha.
const PROYECTO_ID = 1;
const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const JOSE = 'jose.ramirez@uvg.edu.gt';

test('abrir desde la barra, buscar la conversación, enviar y verlo en la otra sesión', async ({ browser }) => {
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
    await pageB.goto('/dashboard');

    // Desde la barra superior se llega a la página y se busca la conversación.
    await iconoMensajes(pageA).click();
    await expect(pageA).toHaveURL(/\/dashboard\/mensajes$/);
    await pageA.getByPlaceholder('Buscar mensajes').fill('José');
    await pageA.getByRole('button', { name: /José/ }).first().click();
    await expect(pageA).toHaveURL(/\/dashboard\/mensajes\/(\d+)$/);
    const idConversacion = /(\d+)$/.exec(pageA.url())?.[1];

    // Carlos escribe; José abre la misma URL y lo ve en vivo.
    await pageB.goto(`/dashboard/mensajes/${idConversacion}`);
    const mensaje = `PaginaMensajes ${Math.random().toString(36).slice(2)}`;
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();
    await expect(pageB.getByText(mensaje).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('en móvil se ve primero la lista y «Volver» regresa a ella desde la conversación', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await desactivarTour(page);
  try {
    await login(page, JOSE);
    await page.goto('/dashboard/mensajes');
    await expect(page.getByPlaceholder('Buscar mensajes')).toBeVisible();
    await page.getByRole('button', { name: /Carlos/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/mensajes\/\d+$/);
    await expect(page.getByPlaceholder('Buscar mensajes')).toBeHidden();
    await page.getByRole('button', { name: 'Volver a la lista de mensajes' }).click();
    await expect(page).toHaveURL(/\/dashboard\/mensajes$/);
    await expect(page.getByPlaceholder('Buscar mensajes')).toBeVisible();
  } finally {
    await context.close();
  }
});
