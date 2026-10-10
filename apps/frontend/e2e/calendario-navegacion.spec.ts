import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// G02-C14 (UI-02, UI-04, T-324): la semana es legible en cada ancho y la página nunca desborda.
const CORREO = 'carlos.mendoza@uvg.edu.gt';

async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

const overflowHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Calendario: semana legible por ancho y tema (HU-184, G02)', () => {
  test.beforeEach(async ({ page }) => {
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO);
  });

  for (const [ancho, esperaCuadricula] of [
    [375, false],
    [1024, false],
    [1440, true],
  ] as const) {
    test(`en ${ancho} px la semana usa ${esperaCuadricula ? 'la cuadrícula por horas' : 'la lista de días'} sin desbordar la página`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto('/dashboard/calendario');
      await expect(page.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
      const cuadricula = page.getByTestId('cuadricula-horas');
      if (esperaCuadricula) {
        await expect(cuadricula).toBeVisible();
      } else {
        await expect(cuadricula).toBeHidden();
      }
      expect(await overflowHorizontal(page)).toBe(0);

      await page.getByRole('radio', { name: 'Día' }).click();
      await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
      expect(await overflowHorizontal(page)).toBe(0);
      await page.getByRole('radio', { name: 'Mes' }).click();
      expect(await overflowHorizontal(page)).toBe(0);
    });
  }

  test('en tema oscuro las vistas Día y Semana se dibujan sin desbordar y conservan la navegación', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/calendario');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
    expect(await overflowHorizontal(page)).toBe(0);
    await page.getByRole('radio', { name: 'Día' }).click();
    await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
    expect(await overflowHorizontal(page)).toBe(0);
  });
});
