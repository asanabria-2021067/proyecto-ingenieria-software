import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * IESUC-568 (B1, NeuroLab): en el detalle de la tarea, el cambio de estado y
 * «Registrar horas» se ven sin hacer scroll, junto al título. Se usa la tarea
 * sembrada 3 (POR_HACER, asignada a José en un sprint activo). El PATCH de
 * estado se responde aquí para no alterar la siembra que comparten otros specs;
 * no se envía ningún registro de horas.
 */

test.describe.configure({ timeout: 60_000 });

const JOSE = 'jose.ramirez@uvg.edu.gt';
const PROYECTO = 1;
const TAREA = 3;
const RUTA = `/dashboard/projects/${PROYECTO}/kanban/tasks/${TAREA}`;

async function dentroDeLaVentana(page: Page, selector: ReturnType<Page['getByRole']>): Promise<void> {
  const caja = await selector.boundingBox();
  const ventana = page.viewportSize();
  expect(caja, 'el elemento debe tener caja').not.toBeNull();
  expect(caja!.y).toBeGreaterThanOrEqual(0);
  expect(caja!.y + caja!.height).toBeLessThanOrEqual(ventana!.height);
}

for (const pantalla of [
  { nombre: 'escritorio', width: 1280, height: 720 },
  { nombre: 'móvil', width: 390, height: 844 },
]) {
  test(`${pantalla.nombre}: estado y «Registrar horas» visibles sin scroll, cerca del título`, async ({ page }) => {
    await page.setViewportSize({ width: pantalla.width, height: pantalla.height });
    await desactivarTour(page);
    await login(page, JOSE);
    await page.goto(RUTA);

    const acciones = page.getByRole('group', { name: 'Acciones de la tarea' });
    const estado = acciones.getByRole('combobox', { name: /^Cambiar estado de / });
    const registrar = acciones.getByRole('button', { name: 'Registrar horas' });
    await expect(estado).toBeVisible({ timeout: 20_000 });
    await expect(registrar).toBeVisible({ timeout: 20_000 });

    await dentroDeLaVentana(page, estado);
    await dentroDeLaVentana(page, registrar);
  });
}

test('pasar a «En progreso» y llegar al formulario de horas desde la cabecera', async ({ page }) => {
  await desactivarTour(page);
  await login(page, JOSE);
  await page.goto(RUTA);

  let cuerpo: unknown = null;
  await page.route(`**/api/proyectos/${PROYECTO}/tareas/${TAREA}/estado`, async (route) => {
    cuerpo = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ idTarea: TAREA }) });
  });

  const acciones = page.getByRole('group', { name: 'Acciones de la tarea' });
  await acciones.getByRole('combobox', { name: /^Cambiar estado de / }).click();
  await page.getByRole('option', { name: 'En progreso' }).click();
  await expect.poll(() => cuerpo).toEqual({ estadoTarea: 'EN_PROGRESO' });

  await acciones.getByRole('button', { name: 'Registrar horas' }).click();
  const horas = page.getByRole('form', { name: 'Registrar horas' }).getByLabel('Horas');
  await expect(horas).toBeFocused();
  await expect(horas).toBeInViewport();
});
