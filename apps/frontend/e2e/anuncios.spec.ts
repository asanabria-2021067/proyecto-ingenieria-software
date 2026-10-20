import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * HU-191 (T-350/T-351/T-352), de punta a punta: la administracion crea un
 * anuncio, una persona con rol estudiante lo ve como banner, lo cierra y no
 * reaparece (ni al recargar); al final la administracion lo despublica.
 */

test.describe.configure({ mode: 'serial' });

const ADMIN = 'admin@uvg.edu.gt';
const ESTUDIANTE = 'tomas.guerrero@uvg.edu.gt';
const TITULO = `Mantenimiento E2E ${Date.now()}`;

async function sesion(browser: Browser, correo: string, destino?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  await login(page, correo, destino);
  return page;
}

test('administracion crea el anuncio, el estudiante lo cierra y no reaparece, y se despublica', async ({ browser }) => {
  test.setTimeout(180_000);

  // 1. Administracion crea un anuncio URGENTE para todos.
  const admin = await sesion(browser, ADMIN, '/dashboard/admin');
  await admin.goto('/dashboard/admin/anuncios');
  await expect(admin.getByRole('heading', { level: 1, name: 'Anuncios' })).toBeVisible();
  await admin.getByRole('button', { name: 'Nuevo anuncio' }).click();
  const dialogo = admin.getByRole('dialog');
  await dialogo.getByLabel('Título').fill(TITULO);
  await dialogo.getByLabel('Mensaje').fill('El sistema estara en mantenimiento esta noche.');
  await dialogo.getByLabel('Nivel').selectOption('URGENTE');
  await dialogo.getByLabel('Audiencia').selectOption('TODOS');
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
  const fila = admin.getByRole('row', { name: new RegExp(TITULO) });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Vigente');

  // 2. El estudiante ve el banner y lo cierra.
  const estudiante = await sesion(browser, ESTUDIANTE);
  await estudiante.goto('/dashboard');
  const banner = estudiante.getByTestId('anuncio-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('role', 'alert');
  await expect(banner).toContainText(TITULO);
  await banner.getByRole('button', { name: /Cerrar anuncio/ }).click();
  await expect(estudiante.getByText(TITULO)).toHaveCount(0);

  // 3. No reaparece al recargar: el cierre queda guardado por usuario.
  await estudiante.reload();
  await expect(estudiante.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(estudiante.getByText(TITULO)).toHaveCount(0);

  // 4. Administracion lo despublica.
  await fila.getByRole('button', { name: /Despublicar/ }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Despublicar' }).click();
  await expect(fila).toContainText('Despublicado');
});
