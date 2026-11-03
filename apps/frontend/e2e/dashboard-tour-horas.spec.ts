import { test, expect } from './support/test';
import { login } from './support/auth';

/**
 * FIX: sin beacon fuera del paso activo del tour, y las tarjetas de horas del
 * dashboard coinciden con el bloque «Horas de este semestre». Solo lectura.
 */
test.describe.configure({ timeout: 60_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';

test('un usuario que no ha visto el tour no tiene ningún beacon', async ({ page }) => {
  await login(page, CARLOS);
  await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('onboarding_seen_'))
      .forEach((k) => localStorage.removeItem(k)),
  );
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.locator('.react-joyride__beacon, [data-test-id="beacon"]')).toHaveCount(0);
});

test('las tarjetas de horas del semestre coinciden con «Horas de este semestre»', async ({ page }) => {
  await login(page, CARLOS);
  const bloque = page.getByRole('region', { name: 'Horas de este semestre' });
  await expect(bloque).toBeVisible();
  for (const [tarjeta, tramo] of [
    ['Horas beca del semestre', 'Horas beca'],
    ['Horas de extensión del semestre', 'Horas de extensión'],
  ]) {
    const kpi = page
      .locator('#stats-container')
      .getByText(tarjeta, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    const [avance, meta] = (await kpi.innerText()).match(/(\d+(?:\.\d+)?)\s*\n?\s*\/\s*(\d+)/)!.slice(1);
    const fila = bloque.locator('li', { hasText: new RegExp(tramo, 'i') }).first();
    const m = (await fila.innerText()).match(/(\d+(?:\.\d+)?)\s*h\s+de\s+(\d+)\s*h/)!;
    expect(m[1]).toBe(avance);
    expect(m[2]).toBe(meta);
  }
});
