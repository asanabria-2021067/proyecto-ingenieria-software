import { test, expect } from '@playwright/test';

// Usuario real del seed (perfilEstudiante.carne = '24001'): forgotPassword
// responde siempre el mismo mensaje genérico exista o no la cuenta, pero
// usar datos reales ejercita también la escritura real en
// SolicitudRecuperacion, no solo la rama "no-op" de un carné inventado.
const CARNE = '24001';
const CORREO = 'carlos.mendoza@uvg.edu.gt';

// smoke: recuperación de contraseña (T-125, flujo 3)
//
// Alcance: este flujo es administrado manualmente (un admin revisa la
// solicitud y entrega el enlace de recuperación fuera de banda; no hay
// integración de correo real — ver app/recuperar-contrasena/page.tsx). El
// tramo de /reset-password?token=... depende de esa acción humana y queda
// fuera de este smoke test a propósito, para no simular una entrega de
// correo que no existe. Aquí se cubre hasta donde el navegador sí puede
// llegar: enviar la solicitud y confirmar que quedó registrada.
test('un usuario puede solicitar la recuperación de su contraseña desde el login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Olvide mi contraseña' }).click();
  await page.waitForURL('**/recuperar-contrasena');

  await page.getByPlaceholder('21000').fill(CARNE);
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(CORREO);
  await page.getByRole('button', { name: 'Enviar solicitud de recuperacion' }).click();

  await expect(page.getByText('Solicitud registrada')).toBeVisible();
});
