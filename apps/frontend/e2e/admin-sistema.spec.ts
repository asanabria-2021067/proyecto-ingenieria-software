import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * ADM-1: pantallas de sistema del administrador contra la pila aislada. Solo
 * lectura: no activa el modo mantenimiento (afectaría a las demás suites).
 */

const ADMIN = 'admin@uvg.edu.gt';

test.beforeEach(async ({ page }) => {
  await desactivarTour(page);
  await login(page, ADMIN, '/dashboard/admin');
});

test('el panel muestra la tarjeta de estado del sistema', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Estado del sistema' })).toBeVisible();
  await expect(page.getByText('Base de datos')).toBeVisible();
  await expect(page.getByText(/Versión desplegada/)).toBeVisible();
});

test('la vista de tablas es de solo lectura y abre el detalle de un registro', async ({ page }) => {
  await page.getByRole('button', { name: /Sistema/ }).click();
  await page.getByRole('link', { name: 'Tablas del sistema' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tablas del sistema' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: /editar|eliminar|borrar/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible();

  await page.getByRole('button', { name: /Ver detalle del registro/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('la configuración de mantenimiento se carga con su mensaje estándar', async ({ page }) => {
  await page.goto('/dashboard/admin/mantenimiento');
  await expect(page.getByRole('heading', { level: 1, name: 'Modo mantenimiento' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Activar mantenimiento ahora' })).toBeVisible();
  await expect(page.getByLabel('Mensaje para los usuarios')).toBeVisible();
});
