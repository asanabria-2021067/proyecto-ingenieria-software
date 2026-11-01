import { test, expect } from './support/test';
import { login } from './support/auth';
import { abrirChatIndividualCon } from './support/chat';

const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';

// Envia un mensaje con un enlace en un chat y lo ve en "Enlaces compartidos".
test('los enlaces enviados aparecen en la galeria de enlaces compartidos', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return original.call(this, key);
    };
  });
  await login(page, CORREO_A);
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

  await abrirChatIndividualCon(page, 'María');

  const marca = Math.random().toString(36).slice(2, 8);
  const url = `https://ejemplo-${marca}.org/guia`;
  await page.getByPlaceholder('Escribe un mensaje…').fill(`Revisa ${url}.`);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText(`Revisa ${url}.`).first()).toBeVisible();

  await page.getByRole('button', { name: 'Opciones de la conversación' }).click();
  await page.getByRole('menuitem', { name: 'Enlaces compartidos' }).click();

  const enlace = page.getByRole('dialog').getByRole('link', { name: new RegExp(`ejemplo-${marca}\\.org`) });
  await expect(enlace).toBeVisible();
  await expect(enlace).toHaveAttribute('href', url);
  await expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(enlace).toHaveAttribute('target', '_blank');
});
