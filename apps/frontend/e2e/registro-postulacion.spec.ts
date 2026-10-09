import { test, expect } from './support/test';
import { login } from './support/auth';

// Proyecto 1 "Plataforma de Tutorías UVG" viene del seed (prisma/seed.ts),
// siempre PUBLICADO. El backend solo valida cupos si el proyecto está
// EN_PROGRESO, así que cualquier rol suyo sirve sin preocuparse por cupos.
const PROYECTO_TUTORIAS_ID = 1;
const CORREO_ADMIN = 'admin@uvg.edu.gt';
const CONTRASENA = 'Passw0rd!';

// smoke: registro y postulación (T-125, flujo 1)
test('un usuario nuevo se registra, administración lo aprueba, entra a proyectos y se postula', async ({ page, browser }) => {
  const marca = Date.now();
  const correo = `smo${marca}@uvg.edu.gt`;

  await page.goto('/registro');
  await page.getByPlaceholder('Juan').fill('E2E');
  await page.getByPlaceholder('Perez').fill('Smoke');
  await page.getByPlaceholder('24000').fill(`${marca}`);
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByTestId('registro-carrera-select').selectOption({ index: 1 });
  await page.getByPlaceholder('Minimo 8 caracteres').fill(CONTRASENA);
  await page.getByPlaceholder('••••••••').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Crear Cuenta' }).click();

  await page.waitForURL('**/login', { timeout: 15_000 });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, CORREO_ADMIN);
  const pendientes = await adminPage.request.get('/api/admin/cuentas-pendientes');
  expect(pendientes.ok()).toBe(true);
  const { cuentas } = (await pendientes.json()) as { cuentas: { idUsuario: number; correo: string }[] };
  const cuenta = cuentas.find((c) => c.correo === correo);
  expect(cuenta).toBeDefined();
  const aprobacion = await adminPage.request.patch(`/api/admin/cuentas-pendientes/${cuenta!.idUsuario}/aprobar`);
  expect(aprobacion.ok()).toBe(true);
  await adminContext.close();

  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByPlaceholder('Minimo 8 caracteres').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });

  await page.goto('/dashboard/proyectos');
  await page
    .getByTestId(`project-card-${PROYECTO_TUTORIAS_ID}`)
    .getByRole('link', { name: 'Ver proyecto' })
    .click();
  await page.waitForURL(`**/dashboard/proyectos/${PROYECTO_TUTORIAS_ID}`);

  await page.getByRole('link', { name: /Postularme al rol/ }).first().click();
  await page.waitForURL('**/postular/**');

  await page
    .locator('textarea[name="justificacion"]')
    .fill('Tengo experiencia relevante en desarrollo frontend y quiero aportar al proyecto de tutorías.');
  await page.getByRole('button', { name: 'Enviar Postulación' }).click();

  await expect(page.getByText('¡Postulación enviada!')).toBeVisible();
});
