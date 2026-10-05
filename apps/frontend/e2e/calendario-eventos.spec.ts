import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// carlos.mendoza lidera el Proyecto 1 (seed), PUBLICADO: puede crear eventos.
// Lidera también otros (uno en solicitud de cierre), así que el proyecto se
// elige explícitamente en vez de confiar en el que el diálogo propone.
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const PROYECTO = 'Plataforma de Tutorías UVG';
const LINK = 'https://meet.google.com/e2e-hu184';

/**
 * El navegador arranca "mañana a las 08:00": el diálogo propone 09:00–10:00
 * del mismo día, siempre en el futuro para el backend (que rechaza inicios
 * pasados con su propio reloj) y sin el caso borde de las 23:00, donde el fin
 * propuesto cae al día siguiente. Solo se fija Date; los timers siguen.
 */
async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

async function abrirNuevoEvento(page: Page) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo evento' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Proyecto').click();
  await page.getByRole('option', { name: PROYECTO }).click();
  return dialogo;
}

test.describe('Calendario: diálogo de evento (HU-184, T-325)', () => {
  test.beforeEach(async ({ page }) => {
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
  });

  test('no envía con campos vacíos ni con el fin antes del inicio', async ({ page }) => {
    const dialogo = await abrirNuevoEvento(page);
    const crear = dialogo.getByRole('button', { name: 'Crear evento' });

    // Campos vacíos: título y link (la modalidad por defecto es virtual).
    await crear.click();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toBeVisible();
    await expect(dialogo.getByText('Ingresa el link de la sesión.')).toBeVisible();
    await expect(dialogo).toBeVisible();

    // Fin antes del inicio, mismo día.
    await dialogo.getByLabel('Título').fill('Evento que no debe crearse');
    await dialogo.getByLabel('Link de la sesión').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('10:00');
    await dialogo.getByLabel('Hora de fin').fill('09:00');
    await crear.click();
    await expect(dialogo.getByText('El fin debe ser posterior al inicio.')).toBeVisible();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toHaveCount(0);
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('button', { name: /Evento que no debe crearse/ })).toHaveCount(0);
  });

  test('crea, edita y borra un evento desde el diálogo', async ({ page }) => {
    const titulo = `E2E HU-184 ${Date.now()}`;
    const tituloEditado = `${titulo} editado`;

    // Crear
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título').fill(titulo);
    await dialogo.getByLabel('Link de la sesión').fill(LINK);
    await dialogo.getByRole('button', { name: 'Crear evento' }).click();
    await expect(page.getByText('Evento creado')).toBeVisible();
    await expect(dialogo).toBeHidden();

    // La fila de la agenda (debajo del mes) abre el detalle del evento.
    const fila = page.getByRole('button', { name: new RegExp(`^${titulo}`) });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await fila.click();
    const detalle = page.getByRole('dialog', { name: titulo });
    await expect(detalle.getByText('Virtual', { exact: true })).toBeVisible();
    await expect(detalle.getByText(PROYECTO)).toBeVisible();

    // Editar
    await detalle.getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion.getByLabel('Título')).toHaveValue(titulo);
    await edicion.getByLabel('Título').fill(tituloEditado);
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();
    await expect(edicion).toBeHidden();

    const filaEditada = page.getByRole('button', { name: new RegExp(`^${tituloEditado}`) });
    await expect(filaEditada).toBeVisible({ timeout: 15_000 });

    // Borrar (cancelar) desde el diálogo de edición, con la confirmación común.
    await filaEditada.click();
    await page.getByRole('dialog', { name: tituloEditado }).getByRole('button', { name: 'Editar evento' }).click();
    await edicion.getByRole('button', { name: 'Cancelar evento' }).click();
    const confirmacion = page.getByRole('alertdialog');
    await expect(confirmacion).toContainText(tituloEditado);
    await confirmacion.getByRole('button', { name: 'Cancelar evento' }).click();
    await expect(page.getByText('Evento cancelado')).toBeVisible();
    await expect(edicion).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(`^${tituloEditado}`) })).toHaveCount(0, { timeout: 15_000 });
  });
});
