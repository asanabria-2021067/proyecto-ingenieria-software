import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * FIX-A6: «Mi asociación» en el menú lateral solo para quien es de una junta. La lista de juntas se
 * simula en la red (`/asociaciones/mis-juntas` ya está cubierto en el servidor); aquí se prueba el menú real.
 */

const ESTUDIANTE = 'tomas.guerrero@uvg.edu.gt';

const junta = (idAsociacion: number, nombre: string) => ({ idAsociacion, nombre, logoUrl: null, cargo: 'VOCAL', nivelPermiso: 'LECTURA' });

async function abrirDashboard(page: Page, juntas: ReturnType<typeof junta>[]) {
  await page.route('**/asociaciones/mis-juntas', (ruta) => ruta.fulfill({ json: juntas }));
  await desactivarTour(page);
  await login(page, ESTUDIANTE);
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Mis Tareas' }).first()).toBeVisible();
}

test.describe('Mi asociación en el menú lateral', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('quien no es de una junta no la ve', async ({ page }) => {
    await abrirDashboard(page, []);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByText('Mi asociación')).toHaveCount(0);
  });

  test('con una junta es un enlace directo a su vista', async ({ page }) => {
    await abrirDashboard(page, [junta(7, 'Asociación de Estudiantes de Computación')]);
    const enlace = page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mi asociación' });
    await expect(enlace).toHaveAttribute('href', '/dashboard/asociacion/7');
  });

  test('con varias juntas ofrece elegir cuál abrir', async ({ page }) => {
    await abrirDashboard(page, [junta(7, 'Asociación de Computación'), junta(9, 'Asociación de Industrial')]);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('button', { name: /Mi asociación/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'Asociación de Computación' })).toHaveAttribute('href', '/dashboard/asociacion/7');
    await expect(nav.getByRole('link', { name: 'Asociación de Industrial' })).toHaveAttribute('href', '/dashboard/asociacion/9');
  });
});
