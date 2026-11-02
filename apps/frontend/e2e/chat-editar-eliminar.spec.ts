import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { abrirChatIndividualCon } from './support/chat';

// Mismo par de usuarios del seed que chat-mensajeria.spec.ts (Proyecto 1).
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// El tour de onboarding (react-joyride) intercepta clicks; se neutraliza igual que en chat-mensajeria.spec.ts.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

test('el autor edita y elimina su mensaje y el otro participante lo ve en vivo', async ({ browser }) => {
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
    await abrirChatIndividualCon(pageB, 'Carlos');

    const marca = `${test.info().workerIndex}-${Math.random().toString(36).slice(2)}`;
    const original = `Mensaje original ${marca}`;
    const editado = `Mensaje editado ${marca}`;

    await pageA.getByPlaceholder('Escribe un mensaje…').fill(original);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.locator('main section').getByText(original)).toBeVisible();
    await expect(pageB.locator('main section').getByText(original)).toBeVisible();

    // B no puede editar ni eliminar un mensaje ajeno. Desde MEJ-44/46 el menu existe para todos
    // (Recuerdamelo, crear tarea), asi que se comprueba que no ofrece Editar ni Eliminar.
    await pageB.locator('main section').getByText(original).hover();
    await pageB.getByRole('button', { name: 'Acciones del mensaje' }).last().click();
    await expect(pageB.getByRole('menuitem').first()).toBeVisible();
    await expect(pageB.getByRole('menuitem', { name: 'Editar' })).toHaveCount(0);
    await expect(pageB.getByRole('menuitem', { name: 'Eliminar' })).toHaveCount(0);
    await pageB.keyboard.press('Escape');

    // A edita con Enter.
    await pageA.locator('main section').getByText(original).hover();
    await pageA.getByRole('button', { name: 'Acciones del mensaje' }).last().click();
    await pageA.getByRole('menuitem', { name: 'Editar' }).click();
    const campo = pageA.getByRole('textbox', { name: 'Editar mensaje' });
    await campo.fill(editado);
    await campo.press('Enter');
    await expect(pageA.locator('main section').getByText(editado)).toBeVisible();
    await expect(pageA.locator('main section').getByText('(editado)')).toBeVisible();

    // B lo ve actualizado sin recargar.
    await expect(pageB.locator('main section').getByText(editado)).toBeVisible();
    await expect(pageB.locator('main section').getByText('(editado)')).toBeVisible();
    await expect(pageB.locator('main section').getByText(original)).toHaveCount(0);

    // Esc cancela la edicion sin cambios.
    await pageA.locator('main section').getByText(editado).hover();
    await pageA.getByRole('button', { name: 'Acciones del mensaje' }).last().click();
    await pageA.getByRole('menuitem', { name: 'Editar' }).click();
    const campo2 = pageA.getByRole('textbox', { name: 'Editar mensaje' });
    await campo2.fill('no deberia guardarse');
    await campo2.press('Escape');
    await expect(pageA.locator('main section').getByText(editado)).toBeVisible();
    await expect(pageA.locator('main section').getByText('no deberia guardarse')).toHaveCount(0);

    // A elimina con confirmacion.
    await pageA.locator('main section').getByText(editado).hover();
    await pageA.getByRole('button', { name: 'Acciones del mensaje' }).last().click();
    await pageA.getByRole('menuitem', { name: 'Eliminar' }).click();
    await pageA.getByRole('button', { name: 'Eliminar mensaje' }).click();

    await expect(pageA.locator('main section').getByText('Mensaje eliminado').last()).toBeVisible();
    await expect(pageB.locator('main section').getByText('Mensaje eliminado').last()).toBeVisible();
    await expect(pageA.locator('main section').getByText(editado)).toHaveCount(0);
    await expect(pageB.locator('main section').getByText(editado)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
