import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

const PROYECTO_ID = 1;

// Mismo neutralizador del tour que usan los demas specs de chat.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

async function abrirListaDeChats(page: Page) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
}

// Garantiza que exista el chat individual con `nombreOtro` (lo crea si falta).
async function asegurarChatCon(page: Page, nombreOtro: string) {
  await abrirListaDeChats(page);
  if (await page.getByRole('button', { name: new RegExp(nombreOtro) }).count()) {
    await abrirListaDeChats(page);
    return;
  }
  await abrirListaDeChats(page);
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

test('estado: se define, lo ve la otra persona en su lista y se limpia', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, 'carlos.mendoza@uvg.edu.gt');
    await login(pageB, 'jose.ramirez@uvg.edu.gt');
    await pageA.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
    await pageB.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
    await asegurarChatCon(pageA, 'José');

    // Carlos define "En clase" desde la cabecera de la lista de chats.
    await abrirListaDeChats(pageA);
    await pageA.getByRole('button', { name: 'Definir mi estado' }).click();
    await pageA.getByRole('radio', { name: 'En clase' }).click();
    await pageA.getByLabel('Borrar estado después de').selectOption('30m');
    await pageA.getByRole('button', { name: 'Guardar' }).click();
    await expect(pageA.getByRole('button', { name: 'Mi estado: En clase. Cambiar' })).toBeVisible();

    // José lo ve (icono + texto) junto a Carlos en su lista.
    await abrirListaDeChats(pageB);
    const filaCarlos = pageB.getByRole('button', { name: /Carlos/ }).first();
    await expect(filaCarlos.getByText('En clase')).toBeVisible();

    // Carlos lo limpia y desaparece para José sin recargar.
    await pageA.getByRole('button', { name: 'Mi estado: En clase. Cambiar' }).click();
    await pageA.getByRole('button', { name: 'Limpiar estado' }).click();
    await expect(pageA.getByRole('button', { name: 'Definir mi estado' })).toBeVisible();
    await expect(filaCarlos.getByText('En clase')).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
