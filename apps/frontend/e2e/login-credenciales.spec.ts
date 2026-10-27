import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './support/test';
import { TAGS_WCAG } from './support/a11y';

/**
 * IESUC-568 (B4, NeuroLab): credenciales inválidas → mensaje genérico junto a
 * los campos (sin decir cuál falló), ambos marcados con aria-invalid, una
 * indicación de qué hacer y «¿Olvidaste tu contraseña?». Se usa un correo que
 * no existe y un solo intento: no bloquea cuentas reales ni agota el límite.
 */

test('credenciales inválidas: error junto a los campos, ambos marcados y enlace de recuperación', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(`no-existe-${Date.now()}@uvg.edu.gt`);
  await page.getByPlaceholder('Minimo 8 caracteres').fill('Incorrecta-123');
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();

  const alerta = page.locator('#login-error');
  await expect(alerta).toBeVisible();
  await expect(alerta).toHaveAttribute('role', 'alert');
  await expect(alerta).toContainText('No se pudo iniciar sesion. Verifica tu correo y contraseña.');
  await expect(alerta).not.toContainText(/no existe|no registrado|incorrect/i);
  // No hay diálogo modal que cerrar.
  await expect(page.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);

  for (const placeholder of ['usuario@uvg.edu.gt', 'Minimo 8 caracteres']) {
    const campo = page.getByPlaceholder(placeholder);
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAttribute('aria-describedby', /login-error/);
  }
  // El borde de error usa el color de error del tema, no el borde neutro.
  const bordeCorreo = await page.getByPlaceholder('usuario@uvg.edu.gt').evaluate((el) => getComputedStyle(el).borderTopColor);
  const colorError = await alerta.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(bordeCorreo).toBe(colorError);

  const graves = (await new AxeBuilder({ page }).include('form').withTags([...TAGS_WCAG]).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(graves.map((v) => v.id)).toEqual([]);

  await alerta.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/recuperar-contrasena/);
});
