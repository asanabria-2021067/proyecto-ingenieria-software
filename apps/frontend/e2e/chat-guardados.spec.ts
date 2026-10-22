import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par de usuarios que chat-mensajeria.spec.ts (ambos participan en el Proyecto 1 del seed).
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

// El tour de onboarding intercepta clicks; se neutraliza igual que en chat-mensajeria.spec.ts.
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

test('guardar un mensaje es privado: aparece en Mensajes guardados de quien lo guarda y no de la otra persona', async ({ browser }) => {
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
    const mensaje = `Guardar esto ${Math.random().toString(36).slice(2)}`;
    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje).first()).toBeVisible();

    // A guarda el mensaje (la accion solo es visible al hover/foco, por eso force/foco).
    const guardar = pageA.getByRole('button', { name: 'Guardar mensaje' }).last();
    await guardar.focus();
    await guardar.click();
    await expect(pageA.getByRole('button', { name: 'Quitar de guardados' }).last()).toHaveAttribute('aria-pressed', 'true');

    // A lo ve en Mensajes guardados.
    await pageA.getByRole('button', { name: /^mensajes/i }).click();
    await pageA.getByRole('button', { name: 'Ver mensajes guardados' }).click();
    const dialogoA = pageA.getByRole('dialog', { name: 'Mensajes guardados' });
    await expect(dialogoA.getByText(mensaje)).toBeVisible();

    // B recibe el mensaje pero su lista de guardados no lo contiene.
    await abrirChatIndividualCon(pageB, 'Carlos');
    await expect(pageB.getByText(mensaje).first()).toBeVisible();
    await expect(pageB.getByRole('button', { name: 'Guardar mensaje' }).last()).toHaveAttribute('aria-pressed', 'false');
    await pageB.getByRole('button', { name: /^mensajes/i }).click();
    await pageB.getByRole('button', { name: 'Ver mensajes guardados' }).click();
    const dialogoB = pageB.getByRole('dialog', { name: 'Mensajes guardados' });
    await expect(dialogoB.getByText('Aún no has guardado mensajes.')).toBeVisible();

    // A quita el guardado desde la lista.
    await dialogoA.getByRole('button', { name: 'Quitar de guardados' }).click();
    await expect(dialogoA.getByText(mensaje)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
