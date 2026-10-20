import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

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

test('el apodo es privado: solo lo ve quien lo define', async ({ browser }) => {
  test.setTimeout(60_000);
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

    const apodo = `Mari${Math.random().toString(36).slice(2, 7)}`;
    await pageA.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageA.getByRole('menuitem', { name: 'Apodos' }).click();
    const dialogo = pageA.getByRole('dialog', { name: 'Apodos' });
    await dialogo.getByLabel(/María/).fill(apodo);
    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    // A ve el apodo (el nombre real queda accesible en title).
    await expect(pageA.getByRole('button', { name: apodo })).toBeVisible();

    // B nunca ve el apodo que A puso.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await expect(pageB.getByText(apodo)).toHaveCount(0);

    // Quitar el apodo vuelve al nombre real.
    await pageA.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageA.getByRole('menuitem', { name: 'Apodos' }).click();
    const dialogo2 = pageA.getByRole('dialog', { name: 'Apodos' });
    await dialogo2.getByLabel(/María/).fill('');
    await dialogo2.getByRole('button', { name: 'Guardar' }).click();
    await expect(pageA.getByRole('button', { name: apodo })).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
