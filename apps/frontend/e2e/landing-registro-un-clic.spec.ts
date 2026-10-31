import { test, expect } from './support/test';

// NL-T2: «Registrarse» en la navbar debe abrir el formulario con UN solo clic.
test.describe('un clic en «Registrarse» abre el formulario', () => {
  test('escritorio', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Registrarse', exact: true }).click();

    await expect(page).toHaveURL(/\/registro$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear Cuenta' })).toBeVisible();
  });

  test('móvil: el menú y un solo clic', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Registrarse', exact: true }).click();

    await expect(page).toHaveURL(/\/registro$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  });
});
