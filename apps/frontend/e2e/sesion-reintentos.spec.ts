import type { Page, Route } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * IESUC-568 (C2): un 429 o un fallo de red en /usuarios/me ya no manda al
 * login (el middleware devolvía al dashboard y la página quedaba en el
 * skeleton). Se reintenta con espera (respetando Retry-After) y, si sigue
 * fallando, se muestra un error con «Reintentar». Las respuestas fallidas se
 * inducen con `page.route`; solo lectura.
 */

test.describe.configure({ timeout: 60_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const ES_ME = (url: URL) => url.pathname.endsWith('/api/usuarios/me');

/** Responde 429 (Retry-After: 1) a las primeras `fallos` peticiones de /usuarios/me. */
async function limitarSesion(page: Page, fallos: number): Promise<{ llamadas: () => number }> {
  let llamadas = 0;
  await page.route(ES_ME, async (route: Route) => {
    llamadas += 1;
    if (llamadas <= fallos) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '1' },
        body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }),
      });
      return;
    }
    await route.continue();
  });
  return { llamadas: () => llamadas };
}

test.beforeEach(async ({ page }) => {
  await desactivarTour(page);
  await login(page, CARLOS);
});

test('un 429 pasajero se reintenta y el dashboard carga sin pasar por el login', async ({ page }) => {
  const sesion = await limitarSesion(page, 2);

  await page.goto('/dashboard/mis-tareas');

  await expect(page.getByRole('link', { name: 'Saltar al contenido principal' })).toBeAttached({ timeout: 20_000 });
  expect(sesion.llamadas()).toBe(3);
  expect(new URL(page.url()).pathname).toBe('/dashboard/mis-tareas');
  await expect(page.getByRole('alert').filter({ hasText: 'No fue posible cargar tu sesión.' })).toHaveCount(0);
});

test('si el 429 persiste se muestra el error con «Reintentar», y reintentar recupera la sesión', async ({ page }) => {
  await limitarSesion(page, Number.POSITIVE_INFINITY);

  await page.goto('/dashboard/mis-tareas');

  const alerta = page.getByRole('alert').filter({ hasText: 'No fue posible cargar tu sesión.' });
  await expect(alerta).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/dashboard/mis-tareas');
  await expect(page.getByRole('status', { name: 'Cargando UVGenius' })).toHaveCount(0);

  await page.unroute(ES_ME);
  await alerta.getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.getByRole('link', { name: 'Saltar al contenido principal' })).toBeAttached({ timeout: 20_000 });
  await expect(alerta).toHaveCount(0);
});

test('un fallo de red persistente también termina en el error recuperable, no en el login', async ({ page }) => {
  await page.route(ES_ME, (route) => route.abort('internetdisconnected'));

  await page.goto('/dashboard/mis-tareas');

  await expect(page.getByRole('alert').filter({ hasText: 'No fue posible cargar tu sesión.' })).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/dashboard/mis-tareas');
});
