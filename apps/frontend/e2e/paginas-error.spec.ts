import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';
const RUTA_ERROR_SIMULADO = '/e2e/error-simulado';

test('una ruta inexistente muestra la 404 y el botón lleva de vuelta al inicio', async ({ page }) => {
  const respuesta = await page.goto(`/no-existe-${Date.now()}`);

  expect(respuesta?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regresar' })).toBeVisible();

  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('con sesión, una ruta inexistente del dashboard responde 404 y «Volver al inicio» lleva al dashboard', async ({ page }) => {
  await desactivarTour(page);
  await login(page, ESTUDIANTE);

  const respuesta = await page.goto('/dashboard/no-existe');

  expect(respuesta?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  const volver = page.getByRole('link', { name: 'Volver al inicio' });
  await expect(volver).toHaveAttribute('href', '/dashboard');

  await volver.click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('un recurso inexistente dentro del panel muestra la 404 dentro del layout', async ({ page }) => {
  await login(page, ADMIN, '/dashboard/admin');

  await page.goto('/dashboard/admin/proyectos/no-es-un-id/cierre');

  const pagina = page.getByRole('region', { name: 'Página no encontrada' });
  await expect(pagina).toBeVisible();
  await expect(page.locator('aside').getByRole('link', { name: 'Panel Admin' })).toBeVisible();
  await expect(pagina.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/dashboard/admin');
});

test('un error de render muestra la página de error sin detalles técnicos y «Reintentar» la recupera', async ({ page }) => {
  test.skip(process.env.E2E_PRODUCTION_SERVER !== '1', 'La ruta de error simulado solo existe en el servidor del E2E (E2E_PRODUCTION_SERVER=1)');

  await page.goto(RUTA_ERROR_SIMULADO);
  await page.getByRole('button', { name: 'Provocar error' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeVisible();
  await expect(page.getByText(/Fallo simulado|stack interno/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');

  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('button', { name: 'Provocar error' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toHaveCount(0);
});
