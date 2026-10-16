import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Proyecto 1 del seed: carlos.mendoza es el lider y maria.lopez participa con
// el rol UX (mismo par que chat-mensajeria.spec.ts).
const PROYECTO_ID = 1;
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CORREO_MIEMBRO = 'maria.lopez@uvg.edu.gt';

// Mismo neutralizador del tour de onboarding que chat-mensajeria.spec.ts.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

test('el lider crea un canal con una integrante: ella lo ve junto a #general y puede escribir', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextLider = await browser.newContext();
  const contextMiembro = await browser.newContext();
  const paginaLider = await contextLider.newPage();
  const paginaMiembro = await contextMiembro.newPage();
  await desactivarTour(paginaLider);
  await desactivarTour(paginaMiembro);

  const canal = `e2e${Math.random().toString(36).slice(2, 8)}`;

  try {
    await login(paginaLider, CORREO_LIDER);
    await login(paginaMiembro, CORREO_MIEMBRO);
    await paginaLider.goto(`/dashboard/projects/${PROYECTO_ID}`);
    await paginaMiembro.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

    // El lider crea el canal desde el dock.
    await paginaLider.getByRole('button', { name: /^mensajes/i }).click();
    await paginaLider.getByRole('button', { name: 'Crear canal' }).click();
    const dialogo = paginaLider.getByRole('dialog');
    await dialogo.getByLabel('Proyecto').click();
    await paginaLider.getByRole('option').first().click();
    await dialogo.getByLabel('Nombre del canal').fill(canal);
    await dialogo.getByRole('checkbox', { name: /María/ }).click();
    await dialogo.getByRole('button', { name: 'Crear canal' }).click();
    await expect(dialogo).toBeHidden();

    // La integrante ve #general y el canal nuevo en la seccion Canales.
    await paginaMiembro.getByRole('button', { name: /^mensajes/i }).click();
    const seccion = paginaMiembro.getByRole('region', { name: 'Canales' });
    await expect(seccion.getByText('#general').first()).toBeVisible();
    await expect(seccion.getByText(`#${canal}`)).toBeVisible();

    // Y puede escribir en el canal.
    await seccion.getByRole('button', { name: new RegExp(`#${canal}`) }).click();
    const mensaje = `Hola canal ${canal}`;
    await paginaMiembro.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await paginaMiembro.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(paginaMiembro.getByText(mensaje).first()).toBeVisible();
  } finally {
    await contextLider.close();
    await contextMiembro.close();
  }
});
