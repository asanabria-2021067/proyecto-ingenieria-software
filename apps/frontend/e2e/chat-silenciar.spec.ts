import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par real del Proyecto 1 del seed que usa chat-mensajeria.spec.ts.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

async function abrirChatIndividualCon(page: Page, nombreOtro: string) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });

  if (await existente.count()) {
    await existente.first().click();
    return;
  }

  await page.getByRole('button', { name: /^mensajes/i }).click();
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

test('silenciar un chat muestra el indicador y no suma al badge de no leidos', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, CORREO_A);
    await login(pageB, CORREO_B);
    await pageA.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
    await pageB.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

    // B abre el chat con Carlos, lo silencia 1 hora y cierra la ventana.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await pageB.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageB.getByRole('menuitem', { name: 'Silenciar 1 hora' }).click();
    await expect(pageB.getByText('Silenciado').first()).toBeVisible();
    await pageB.getByRole('button', { name: 'Cerrar chat' }).click();

    // A escribe a B.
    const mensaje = `Silencio ${Math.random().toString(36).slice(2)}`;
    await abrirChatIndividualCon(pageA, 'María');
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();

    // B ve el chat con el mensaje nuevo marcado como Silenciado, y el
    // boton del dock no anuncia mensajes sin leer.
    const boton = pageB.getByRole('button', { name: /^mensajes/i });
    await boton.click();
    await expect(pageB.getByText(mensaje).first()).toBeVisible();
    await expect(pageB.getByText('Silenciado').first()).toBeVisible();
    await boton.click();
    await expect(boton).toHaveAccessibleName('Mensajes');

    // Reactivar desde el menu de la ventana.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await pageB.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageB.getByRole('menuitem', { name: 'Activar notificaciones' }).click();
    await pageB.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await expect(pageB.getByRole('menuitem', { name: 'Silenciar 1 hora' })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
