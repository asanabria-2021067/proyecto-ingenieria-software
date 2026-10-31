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

test('no molestar por horario suprime el badge del dock y se puede desactivar', async ({ browser }) => {
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

    // B configura no molestar las 24 h (00:00-23:59, todos los dias).
    await abrirChatIndividualCon(pageB, 'Carlos');
    await pageB.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageB.getByRole('menuitem', { name: 'No molestar por horario' }).click();
    const dialogo = pageB.getByRole('dialog', { name: 'No molestar' });
    await dialogo.getByLabel('Activar no molestar').click();
    await dialogo.getByLabel('Desde').fill('00:00');
    await dialogo.getByLabel('Hasta').fill('23:59');
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialogo).toBeHidden();
    await pageB.getByRole('button', { name: 'Cerrar chat' }).click();

    // El icono de la barra superior indica el modo en su nombre accesible (con el icono de campana tachada).
    const boton = pageB.getByRole('button', { name: /^mensajes/i });
    await expect(boton).toHaveAccessibleName(/no molestar activo/);

    // A escribe a B: el boton de B no anuncia mensajes sin leer.
    const mensaje = `NoMolestar ${Math.random().toString(36).slice(2)}`;
    await abrirChatIndividualCon(pageA, 'María');
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();

    await boton.click();
    await expect(pageB.getByText(mensaje).first()).toBeVisible();
    await boton.click();
    await expect(boton).not.toHaveAccessibleName(/sin leer/);

    // B lo desactiva.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await pageB.getByRole('button', { name: 'Opciones de la conversación' }).click();
    await pageB.getByRole('menuitem', { name: 'No molestar por horario' }).click();
    await dialogo.getByLabel('Activar no molestar').click();
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(boton).not.toHaveAccessibleName(/no molestar activo/);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
