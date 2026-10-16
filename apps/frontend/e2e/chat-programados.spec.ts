import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par de usuarios que chat-mensajeria.spec.ts (Proyecto 1 del seed).
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// Neutraliza el tour de onboarding (se activa por localStorage) para que su
// overlay no intercepte clicks; ver chat-mensajeria.spec.ts.
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

  await page.getByRole('button', { name: /^mensajes/i }).click(); // cierra la lista, vacía
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

/** Valor de <input type="datetime-local"> (hora local) a `minutos` minutos de ahora. */
function enMinutos(minutos: number): string {
  const d = new Date(Date.now() + minutos * 60_000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function programar(page: Page, mensaje: string, minutos: number) {
  await page.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
  await page.getByRole('button', { name: 'Programar envío' }).click();
  await page.getByLabel('Enviar el').fill(enMinutos(minutos));
  await page.getByRole('button', { name: 'Programar', exact: true }).click();
}

test('programar un mensaje, verlo pendiente y cancelarlo', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await desactivarTour(page);

  try {
    await login(page, CORREO_A);
    await page.goto(`/dashboard/projects/${PROYECTO_ID}`);
    await abrirChatIndividualCon(page, 'María');

    const mensaje = `Programado ${Math.random().toString(36).slice(2)}`;
    await programar(page, mensaje, 10);

    const lista = page.getByRole('region', { name: 'Mensajes programados' });
    await expect(lista.getByText(mensaje)).toBeVisible();
    // Programar limpia el input: no se envía en el momento.
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('');

    await lista.getByRole('button', { name: /Cancelar mensaje programado/ }).first().click();
    await expect(lista.getByText(mensaje)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('un mensaje programado llega por socket al otro usuario al vencer', async ({ browser }) => {
  // El cron corre cada minuto: 2 min de antelación + hasta 1 min de espera.
  test.setTimeout(240_000);
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
    await abrirChatIndividualCon(pageB, 'Carlos');

    const mensaje = `Llega solo ${Math.random().toString(36).slice(2)}`;
    await programar(pageA, mensaje, 2);

    await expect(pageB.getByText(mensaje).first()).toBeVisible({ timeout: 180_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
