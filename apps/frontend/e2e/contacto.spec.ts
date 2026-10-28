import { test, expect } from './support/test';
import { login } from './support/auth';

const CORREO_ADMIN = 'admin@uvg.edu.gt';
const RUTA_ADMIN = '/dashboard/admin';
const RUTA_NOTIFICACIONES = '/dashboard/notificaciones';

test('un visitante escribe desde la navbar y administración recibe la notificación', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const asunto = `Soporte E2E ${marca}`;

  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Contacto', exact: true }).click();
  await expect(page).toHaveURL(/\/contacto$/);
  await expect(page.getByRole('heading', { name: 'Contacto y soporte' })).toBeVisible();

  await page.getByLabel('Nombre').fill('Visitante E2E');
  await page.getByLabel('Correo').fill('visitante.e2e@example.com');
  await page.getByLabel('Asunto').fill(asunto);
  await page.getByLabel('Mensaje').fill('No encuentro cómo postularme a un proyecto.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Mensaje enviado' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Asunto')).toHaveValue('');
  await expect(page.getByLabel('Mensaje')).toHaveValue('');

  const contextoAdmin = await browser.newContext();
  const admin = await contextoAdmin.newPage();
  try {
    await login(admin, CORREO_ADMIN, RUTA_ADMIN);
    await admin.goto(RUTA_NOTIFICACIONES);

    const mensaje = admin.getByText(`escribió sobre "${asunto}"`, { exact: false });
    await expect(mensaje).toBeVisible({ timeout: 15_000 });
    await expect(mensaje).toContainText('Visitante E2E (visitante.e2e@example.com)');
    await mensaje.click();
    await expect(admin.getByRole('article').getByRole('heading', { level: 3, name: 'Nueva solicitud de contacto' })).toBeVisible();
  } finally {
    await contextoAdmin.close();
  }
});

test('el formulario muestra los errores por campo y no envía nada', async ({ page }) => {
  let envios = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/contacto')) envios += 1;
  });

  await page.goto('/contacto');
  await page.getByLabel('Correo').fill('correo-invalido');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();

  await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
  await expect(page.getByText('Escribe un correo válido, por ejemplo usuario@uvg.edu.gt.')).toBeVisible();
  await expect(page.getByText('Escribe el asunto.')).toBeVisible();
  await expect(page.getByText('Escribe tu mensaje.')).toBeVisible();
  expect(envios).toBe(0);
});
