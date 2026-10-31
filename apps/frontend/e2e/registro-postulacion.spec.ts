import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Proyecto 1 "Plataforma de Tutorías UVG" viene del seed (prisma/seed.ts),
// siempre PUBLICADO. El backend solo valida cupos si el proyecto está
// EN_PROGRESO, así que cualquier rol suyo sirve sin preocuparse por cupos.
const PROYECTO_TUTORIAS_ID = 1;
const CORREO_ADMIN = 'admin@uvg.edu.gt';
const CONTRASENA = 'Passw0rd!';
const RUTA_ADMIN = '/dashboard/admin';
const RUTA_CUENTAS_PENDIENTES = '/dashboard/admin/cuentas-pendientes';
const API_CUENTAS_PENDIENTES = '/api/admin/cuentas-pendientes';

// Los dos flujos comparten la cuenta de administración y el límite real de
// POST /auth/login y /auth/register (5/min por IP): van uno detrás de otro.
test.describe.configure({ mode: 'default' });

async function registrar(page: Page): Promise<string> {
  const marca = Date.now();
  const correo = `smo${marca}@uvg.edu.gt`;

  await page.goto('/registro');
  await page.getByPlaceholder('Juan').fill('E2E');
  await page.getByPlaceholder('Perez').fill('Smoke');
  await page.getByPlaceholder('24000').fill(`${marca}`);
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  // Desplegable del sistema (no un <select> nativo): se abre y se elige la primera carrera.
  await page.getByTestId('registro-carrera-select').click();
  await page.getByRole('option').first().click();
  await page.getByPlaceholder('Mínimo 8 caracteres').fill(CONTRASENA);
  await page.getByPlaceholder('••••••••').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Crear Cuenta' }).click();

  await page.waitForURL('**/login', { timeout: 15_000 });
  return correo;
}

async function enviarLogin(page: Page, correo: string): Promise<void> {
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByPlaceholder('Mínimo 8 caracteres').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
}

// El registro no abre sesión: sin cookie y sin acceso a la API.
async function expectSinSesion(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name)).not.toContain('access_token');
  expect((await page.request.get('/api/usuarios/me')).status()).toBe(401);
}

async function expectLoginRechazado(page: Page, mensaje: string): Promise<void> {
  await expect(page.getByText(mensaje)).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expectSinSesion(page);
}

async function idCuentaPendiente(adminPage: Page, correo: string): Promise<number> {
  const respuesta = await adminPage.request.get(API_CUENTAS_PENDIENTES);
  expect(respuesta.ok()).toBe(true);
  const { cuentas } = (await respuesta.json()) as { cuentas: { idUsuario: number; correo: string }[] };
  const cuenta = cuentas.find((c) => c.correo === correo);
  expect(cuenta).toBeDefined();
  return cuenta!.idUsuario;
}

async function resolverCuenta(adminPage: Page, correo: string, accion: 'Aprobar' | 'Rechazar'): Promise<void> {
  const fila = adminPage.getByRole('row').filter({ hasText: correo });
  await fila.getByRole('button', { name: `${accion} la cuenta de E2E Smoke` }).click();
  await adminPage.getByRole('alertdialog').getByRole('button', { name: accion }).click();
  await expect(adminPage.getByText(accion === 'Aprobar' ? 'Cuenta aprobada' : 'Cuenta rechazada')).toBeVisible();
  await expect(fila).toHaveCount(0);
}

// smoke: registro y postulación (T-125, flujo 1)
test('un usuario nuevo se registra, administración lo aprueba, entra a proyectos y se postula', async ({ page, browser }) => {
  const correo = await registrar(page);

  // Mientras la cuenta está pendiente no hay sesión ni login posible.
  await expectSinSesion(page);
  await enviarLogin(page, correo);
  await expectLoginRechazado(page, 'Tu cuenta está pendiente de verificación por administración.');

  // Administración aterriza en su panel y llega a la bandeja desde la navegación.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, CORREO_ADMIN, RUTA_ADMIN);
  await expect(adminPage).toHaveURL(new RegExp(`${RUTA_ADMIN}$`));
  await expect(adminPage.getByRole('heading', { name: 'Panel de Administración' })).toBeVisible();

  const listado = await adminPage.request.get(API_CUENTAS_PENDIENTES);
  const { total } = (await listado.json()) as { total: number };
  expect(total).toBeGreaterThan(0);
  const grupo = adminPage.getByRole('button', { name: /^Verificación y seguridad/ });
  await expect(grupo).toContainText(`${total} por atender`);
  await grupo.click();
  const enlace = adminPage.getByRole('link', { name: /Cuentas pendientes/ });
  await expect(enlace).toContainText(`${total} por atender`);
  await enlace.click();
  await adminPage.waitForURL(`**${RUTA_CUENTAS_PENDIENTES}`);
  await expect(adminPage.getByRole('heading', { name: 'Cuentas pendientes' })).toBeVisible();

  await resolverCuenta(adminPage, correo, 'Aprobar');
  await adminContext.close();

  // Solo ahora el estudiante inicia sesión, y aterriza en su dashboard.
  await enviarLogin(page, correo);
  await page.waitForURL('**/dashboard', { timeout: 45_000 });

  // La cuenta aprobada es de estudiante: ni la API ni la pantalla de administración le abren.
  expect((await page.request.get(API_CUENTAS_PENDIENTES)).status()).toBe(403);
  await page.goto(RUTA_CUENTAS_PENDIENTES);
  await page.waitForURL('**/dashboard');
  await expect(page.getByText('No tienes permiso para acceder a esa pantalla.')).toBeVisible();

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

test('administración rechaza una cuenta nueva y esta no puede iniciar sesión', async ({ page, browser }) => {
  const correo = await registrar(page);

  // Sin sesión, la bandeja de administración no responde.
  expect((await page.request.get(API_CUENTAS_PENDIENTES)).status()).toBe(401);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, CORREO_ADMIN, RUTA_ADMIN);
  await expect(adminPage).toHaveURL(new RegExp(`${RUTA_ADMIN}$`));
  const idUsuario = await idCuentaPendiente(adminPage, correo);

  await adminPage.goto(RUTA_CUENTAS_PENDIENTES);
  await resolverCuenta(adminPage, correo, 'Rechazar');

  // Una cuenta ya resuelta no se vuelve a resolver, y una inexistente no existe.
  expect((await adminPage.request.patch(`${API_CUENTAS_PENDIENTES}/${idUsuario}/rechazar`)).status()).toBe(409);
  expect((await adminPage.request.patch(`${API_CUENTAS_PENDIENTES}/${idUsuario}/aprobar`)).status()).toBe(409);
  expect((await adminPage.request.patch(`${API_CUENTAS_PENDIENTES}/2147483647/aprobar`)).status()).toBe(404);
  await adminContext.close();

  // La cuenta rechazada recibe el error genérico de credenciales, no el de «pendiente».
  await enviarLogin(page, correo);
  await expectLoginRechazado(page, 'No se pudo iniciar sesión. Verifica tu correo y contraseña.');
});
