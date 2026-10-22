import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par del seed que chat-mensajeria.spec.ts: ambos participan en el Proyecto 1.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// Neutraliza el tour de onboarding (se activa por localStorage) para que su overlay no intercepte clics.
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

async function enviar(page: Page, texto: string) {
  await page.getByPlaceholder('Escribe un mensaje…').fill(texto);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
}

test('responder citando un mensaje muestra la cita y salta al original resaltado', async ({ browser }) => {
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

    const marca = `${test.info().workerIndex}-${Math.random().toString(36).slice(2)}`;
    const original = `Original ${marca}`;
    const respuesta = `Respuesta ${marca}`;

    await abrirChatIndividualCon(pageA, 'María');
    await enviar(pageA, original);
    await expect(pageA.getByText(original).first()).toBeVisible();
    // Mensajes intermedios para que el original quede lejos de la respuesta.
    for (let i = 0; i < 8; i += 1) await enviar(pageA, `Relleno ${i} ${marca}`);

    await abrirChatIndividualCon(pageB, 'Carlos');
    const bloque = pageB.locator(`[data-mensaje-id]:has-text("${original}")`);
    await expect(bloque).toBeVisible();

    // Responder: aparece la vista previa; Esc la cancela y no se envia nada.
    await bloque.getByRole('button', { name: 'Responder a Carlos' }).click();
    await expect(pageB.getByText('Respondiendo a Carlos')).toBeVisible();
    await pageB.keyboard.press('Escape');
    await expect(pageB.getByText('Respondiendo a Carlos')).toBeHidden();

    // Responder de nuevo y enviar.
    await bloque.getByRole('button', { name: 'Responder a Carlos' }).click();
    await enviar(pageB, respuesta);
    await expect(pageB.getByText('Respondiendo a Carlos')).toBeHidden();

    // La cita llega en vivo a A, dentro de la burbuja.
    const citaEnA = pageA.getByRole('button', { name: new RegExp(`Ir al mensaje original de .*${original}`) });
    await expect(citaEnA).toBeVisible();

    // Clic en la cita: salta al original y lo resalta brevemente.
    await citaEnA.click();
    const originalEnA = pageA.locator(`[data-mensaje-id]:has-text("${original}")`).first();
    await expect(originalEnA).toHaveAttribute('data-resaltado', 'true');
    await expect(originalEnA).not.toHaveAttribute('data-resaltado', 'true', { timeout: 5_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
