import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par real del Proyecto 1 del seed que usa chat-mensajeria.spec.ts.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const NOMBRE_B = 'María';

const URL_MENSAJE = 'https://ejemplo.uvg.test/articulo';
const PREVIEW = {
  url: URL_MENSAJE,
  titulo: 'Articulo de prueba',
  descripcion: 'Descripcion de la vista previa',
  imagen: null,
  sitio: 'ejemplo.uvg.test',
};

// Ver chat-mensajeria.spec.ts: el tour de onboarding intercepta clicks.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

async function abrirChatCon(page: Page, nombreOtro: string) {
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

// El stack local no tiene por que tener salida a internet: se mockea la respuesta
// del endpoint (la seguridad SSRF se prueba en las unitarias del backend).
test('un mensaje con link muestra la tarjeta de vista previa con enlace seguro', async ({ page }) => {
  test.setTimeout(60_000);
  await desactivarTour(page);
  let llamadas = 0;
  await page.route('**/vista-previa', async (route) => {
    llamadas += 1;
    expect(route.request().postDataJSON()).toEqual({ url: URL_MENSAJE });
    await route.fulfill({ json: PREVIEW });
  });

  await login(page, CORREO_A);
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
  await abrirChatCon(page, NOMBRE_B);

  await page.getByPlaceholder('Escribe un mensaje…').fill(`Mira esto ${URL_MENSAJE}`);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();

  const tarjeta = page.getByRole('link', { name: /Articulo de prueba/ }).last();
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText('Descripcion de la vista previa');
  await expect(tarjeta).toHaveAttribute('href', URL_MENSAJE);
  await expect(tarjeta).toHaveAttribute('target', '_blank');
  await expect(tarjeta).toHaveAttribute('rel', /noopener/);
  expect(llamadas).toBeGreaterThan(0);
});

test('si el endpoint falla no aparece tarjeta ni error', async ({ page }) => {
  test.setTimeout(60_000);
  await desactivarTour(page);
  await page.route('**/vista-previa', (route) =>
    route.fulfill({ status: 422, json: { message: 'No se pudo generar la vista previa' } }),
  );

  await login(page, CORREO_A);
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
  await abrirChatCon(page, NOMBRE_B);

  const mensaje = `Link roto ${URL_MENSAJE}?r=${Date.now()}`;
  await page.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();

  await expect(page.getByText(mensaje).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Articulo de prueba/ })).toHaveCount(0);
});
