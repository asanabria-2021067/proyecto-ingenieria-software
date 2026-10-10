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
 * pasados con su propio reloj), y la vista Semana abre en esa semana. Solo
 * se fija Date; los timers siguen.
 */
async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

async function abrirNuevoEvento(page: Page, proyecto = PROYECTO) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('button', { name: 'Agendar actividad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Proyecto', { exact: true }).click();
  await page.getByRole('option', { name: proyecto }).click();
  return dialogo;
}

/**
 * Bloque del evento en la cuadrícula por horas. Se busca en la vista Día:
 * en Semana, si a esa hora hay más de 2 eventos (otras corridas sobre la
 * misma base), se resumen en "+N" y el bloque no se dibuja.
 */
function bloqueEvento(page: Page, titulo: string) {
  return page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) });
}

async function verDia(page: Page) {
  await page.getByRole('radio', { name: 'Día' }).click();
}

test.describe('Calendario: diálogo de evento (HU-184, T-325)', () => {
  test.beforeEach(async ({ page }) => {
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
  });

  test('no envía con campos vacíos ni con el fin antes del inicio', async ({ page }) => {
    const dialogo = await abrirNuevoEvento(page);
    const agendar = dialogo.getByRole('button', { name: 'Agendar evento' });

    // Campos vacíos: título y enlace (la modalidad por defecto es virtual).
    await agendar.click();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toBeVisible();
    await expect(dialogo.getByText('Ingresa el link de la sesión.')).toBeVisible();
    await expect(dialogo).toBeVisible();

    // Hora de fin antes de la de inicio, mismo día.
    await dialogo.getByLabel('Título del evento o actividad').fill('Evento que no debe crearse');
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('10:00');
    await dialogo.getByLabel('Hora de fin').fill('09:00');
    await agendar.click();
    await expect(dialogo.getByText('El fin debe ser posterior al inicio.')).toBeVisible();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toHaveCount(0);
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('button', { name: /^Evento que no debe crearse/ })).toHaveCount(0);
  });

  test('crea, edita y borra un evento desde el diálogo', async ({ page }) => {
    const titulo = `E2E HU-184 ${Date.now()}`;
    const tituloEditado = `${titulo} editado`;

    // Crear (tipo Tutoría, virtual, horario propuesto 09:00–10:00)
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Tipo de actividad').click();
    await page.getByRole('option', { name: 'Tutoría' }).click();
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await expect(dialogo.getByText('Google Meet')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    await expect(dialogo).toBeHidden();

    // El bloque de la cuadrícula abre el detalle del evento.
    await verDia(page);
    const bloque = bloqueEvento(page, titulo);
    await expect(bloque).toBeVisible({ timeout: 15_000 });
    await bloque.click();
    const detalle = page.getByRole('dialog', { name: titulo });
    await expect(detalle.getByText('Tutoría', { exact: true })).toBeVisible();
    await expect(detalle.getByText('Virtual', { exact: true })).toBeVisible();
    await expect(detalle.getByText(PROYECTO)).toBeVisible();

    // Editar
    await detalle.getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion.getByLabel('Título del evento o actividad')).toHaveValue(titulo);
    await edicion.getByLabel('Título del evento o actividad').fill(tituloEditado);
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();
    await expect(edicion).toBeHidden();

    const bloqueEditado = bloqueEvento(page, tituloEditado);
    await expect(bloqueEditado).toBeVisible({ timeout: 15_000 });

    // Borrar desde el diálogo de edición, con la confirmación común.
    await bloqueEditado.click();
    await page.getByRole('dialog', { name: tituloEditado }).getByRole('button', { name: 'Editar evento' }).click();
    await edicion.getByRole('button', { name: 'Eliminar evento' }).click();
    const confirmacion = page.getByRole('alertdialog');
    await expect(confirmacion).toContainText(tituloEditado);
    await confirmacion.getByRole('button', { name: 'Eliminar evento' }).click();
    await expect(page.getByText('Evento eliminado')).toBeVisible();
    await expect(edicion).toBeHidden();
    await expect(bloqueEvento(page, tituloEditado)).toHaveCount(0, { timeout: 15_000 });
  });

  // G02-C14 (UI-06, UI-05, T-325): fecha de fin opcional, medianoche y evento nocturno.
  test('crea un evento 22:00 → 01:00 con "Termina otro día": se ve en ambos días como bloques con hora, no como todo el día', async ({ page }) => {
    const titulo = `E2E nocturno ${Date.now()}`;
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('22:00');
    await dialogo.getByLabel('Hora de fin').fill('01:00');
    // Sin fecha de fin el fin cae "antes" del inicio.
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(dialogo.getByText('El fin debe ser posterior al inicio.')).toBeVisible();

    await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
    await dialogo.getByLabel('Fecha de fin').click();
    const manana = new Date();
    manana.setDate(manana.getDate() + 2); // el reloj fijo es "mañana": el día siguiente a la fecha propuesta
    await page.getByRole('button', { name: new RegExp(`, ${manana.getDate()} de `) }).first().click();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    try {
      await verDia(page);
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 22:00 a 00:00 del día siguiente`) })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Todo el día')).toHaveCount(0);
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 00:00 a 01:00`) })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Todo el día')).toHaveCount(0);
      // El detalle muestra inicio y fin completos (cambia de día).
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 00:00 a 01:00`) }).click();
      await expect(page.getByRole('dialog', { name: titulo }).getByText(/22:00 – .*01:00/)).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 22:00 a 00:00`) }).click();
      await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
      await expect(page.getByText('Evento eliminado')).toBeVisible();
    }
  });

  test('un evento que termina exactamente a las 00:00 ocupa hasta el final de su día y no aparece al siguiente', async ({ page }) => {
    const titulo = `E2E medianoche ${Date.now()}`;
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('23:00');
    await dialogo.getByLabel('Hora de fin').fill('00:00');
    await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
    await dialogo.getByLabel('Fecha de fin').click();
    const manana = new Date();
    manana.setDate(manana.getDate() + 2);
    await page.getByRole('button', { name: new RegExp(`, ${manana.getDate()} de `) }).first().click();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    try {
      await verDia(page);
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 23:00 a 00:00 del día siguiente`) })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}`) })).toHaveCount(0);
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    } finally {
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 23:00 a 00:00`) }).click();
      await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
      await expect(page.getByText('Evento eliminado')).toBeVisible();
    }
  });

  // G02-C14 (UI-03): la búsqueda de lugar se simula (sin Nominatim real) con un nombre de 300 caracteres.
  test('un evento presencial muestra el error de ubicación junto al campo y recorta un nombre de lugar demasiado largo', async ({ page }) => {
    const nombreLargo = 'Edificio ' + 'x'.repeat(300);
    await page.route('**/nominatim.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ place_id: 1, display_name: nombreLargo, lat: '14.6', lon: '-90.5' }]) }),
    );
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill('Visita presencial que no se crea');
    await dialogo.getByRole('radio', { name: 'Presencial' }).click();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    const error = dialogo.getByText('Marca la ubicación de la sesión en el mapa.');
    await expect(error).toBeVisible();
    const input = dialogo.getByLabel('Ubicación presencial');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();

    await input.fill('Edificio');
    await dialogo.getByRole('button', { name: 'Buscar ubicación' }).click();
    await page.getByRole('button', { name: new RegExp(`^${nombreLargo.slice(0, 20)}`) }).click();
    await expect(input).toHaveValue(nombreLargo.slice(0, 255));
    await expect(error).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-invalid', 'false');

    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo).toBeHidden();
  });
});
