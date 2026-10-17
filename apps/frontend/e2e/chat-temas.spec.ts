import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par de cuentas sembradas que chat-mensajeria.spec.ts.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// El tour de onboarding se activa por localStorage y su overlay intercepta clicks.
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

test('el tema de color es propio: A lo cambia y B sigue viendo el suyo', async ({ browser }) => {
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
    await pageA.goto(`/dashboard/projects/${PROYECTO_ID}`);
    await pageB.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

    await abrirChatIndividualCon(pageA, 'María');
    await pageA.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageA.getByRole('menuitem', { name: 'Tema de color' }).click();
    await pageA.getByRole('radio', { name: 'Azul' }).click();
    await expect(pageA.getByRole('radio', { name: 'Azul' })).toBeChecked();
    await pageA.keyboard.press('Escape');

    const mensaje = `Tema azul ${Math.random().toString(36).slice(2)}`;
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first().locator('..')).toHaveClass(/bg-blue-700/);

    // El tema persiste al recargar (viene del backend, no del navegador).
    await pageA.reload();
    await abrirChatIndividualCon(pageA, 'María');
    await expect(pageA.getByText(mensaje).first().locator('..')).toHaveClass(/bg-blue-700/);

    // B no tiene tema: su propia burbuja conserva el color por defecto.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await pageB.getByPlaceholder('Escribe un mensaje…').fill('Respuesta de B');
    await pageB.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageB.getByText('Respuesta de B').first().locator('..')).toHaveClass(/bg-primary/);
    await expect(pageB.getByText('Respuesta de B').first().locator('..')).not.toHaveClass(/bg-blue-700/);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
