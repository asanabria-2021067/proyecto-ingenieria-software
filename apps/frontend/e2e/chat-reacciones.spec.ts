import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par de usuarios del seed que chat-mensajeria.spec.ts (Proyecto 1).
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// Neutraliza el tour de onboarding (react-joyride), que se activa por localStorage.
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

test('un usuario reacciona a un mensaje y el otro ve el conteo agrupado en vivo', async ({ browser }) => {
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
    const mensaje = `Reacciona a esto ${Math.random().toString(36).slice(2)}`;
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();

    await abrirChatIndividualCon(pageB, 'Carlos');
    await expect(pageB.getByText(mensaje).first()).toBeVisible();

    // B abre el selector con el teclado y elige el pulgar arriba.
    const mensajeB = pageB.locator('div', { hasText: mensaje }).last();
    await mensajeB.getByRole('button', { name: 'Reaccionar al mensaje' }).press('Enter');
    await pageB.getByRole('button', { name: /^Reaccionar con / }).first().click();

    // B ve su chip marcado y A lo ve sin recargar (evento reactionUpdated).
    await expect(pageB.getByRole('button', { name: /1 reacción, incluyes la tuya/ })).toHaveAttribute('aria-pressed', 'true');
    const chipA = pageA.getByRole('button', { name: /1 reacción$/ });
    await expect(chipA).toBeVisible();
    await expect(chipA).toHaveAttribute('aria-pressed', 'false');

    // A suma la misma reaccion: ambos ven 2 agrupado en un solo chip.
    await chipA.click();
    await expect(pageA.getByRole('button', { name: /2 reacciones, incluyes la tuya/ })).toBeVisible();
    await expect(pageB.getByRole('button', { name: /2 reacciones, incluyes la tuya/ })).toBeVisible();

    // B quita la suya: vuelve a 1.
    await pageB.getByRole('button', { name: /2 reacciones, incluyes la tuya/ }).click();
    await expect(pageA.getByRole('button', { name: /1 reacción, incluyes la tuya/ })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
