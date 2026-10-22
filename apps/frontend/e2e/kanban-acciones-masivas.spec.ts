import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';
import {
  CORREO_LIDER,
  PROYECTO_TUTORIAS,
  crearTareas,
  eliminarTareas,
  idProyectoPorTitulo,
  tarjeta,
  type TareaCreada,
} from './support/kanban';

/**
 * HU-202/T-385: el líder selecciona varias tarjetas (casilla + Shift+clic
 * para el rango) y las mueve de columna de una sola vez desde la barra de
 * acciones masivas, con confirmación. El cambio persiste tras recargar.
 * Las tareas se crean y eliminan aquí mismo; el seed queda intacto.
 */

test.describe('HU-202: acciones masivas en el Kanban', () => {
  let idProyecto: number;
  let creadas: TareaCreada[] = [];
  const sufijo = Date.now();
  // Misma prioridad: dentro de la columna se ordenan por fecha y luego por
  // id, así que quedan contiguas y en el orden de creación.
  const titulos = [1, 2, 3].map((n) => `HU-202 masiva ${n} ${sufijo}`);

  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await desactivarTour(page);
    await login(page, CORREO_LIDER);
    idProyecto = await idProyectoPorTitulo(page, PROYECTO_TUTORIAS);
    creadas = await crearTareas(
      page,
      idProyecto,
      titulos.map((tituloTarea) => ({ tituloTarea, prioridad: 'BAJA' as const })),
    );
  });

  test.afterEach(async ({ page }) => {
    await eliminarTareas(page, idProyecto, creadas);
  });

  test('el líder ve la ayuda de Shift, selecciona un rango y mueve varias tareas a otra columna', async ({ page }) => {
    await page.goto(`/dashboard/projects/${idProyecto}/kanban`);

    // La página explica cómo seleccionar varias, incluido Shift para el rango.
    await expect(page.getByText(/mantén\s*Shift\s*al hacer clic para seleccionar un rango/)).toBeVisible({
      timeout: 15_000,
    });

    const porHacer = page.locator('[data-column-estado="POR_HACER"]');
    const enRevision = page.locator('[data-column-estado="EN_REVISION"]');
    for (const titulo of titulos) await expect(porHacer.locator(tarjeta(page, titulo))).toBeVisible();

    // Casilla en la primera y Shift+clic en la tercera: queda marcado el rango completo.
    await tarjeta(page, titulos[0]).hover();
    await page.getByRole('checkbox', { name: `Seleccionar "${titulos[0]}"` }).click();
    await page.getByRole('button', { name: `Abrir detalles de "${titulos[2]}"` }).click({ modifiers: ['Shift'] });

    for (const titulo of titulos) await expect(tarjeta(page, titulo)).toHaveAttribute('data-seleccionada', 'true');
    // Shift+clic seleccionó en vez de abrir el detalle.
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${idProyecto}/kanban$`));

    const barra = page.getByRole('toolbar', { name: 'Acciones masivas' });
    await expect(barra).toBeVisible();
    await expect(barra).toContainText('3');
    await expect(barra).toContainText('seleccionadas');

    await barra.getByRole('button', { name: 'Mover a' }).click();
    await page.getByRole('menuitem', { name: 'En revisión' }).click();

    // Confirmación antes de tocar nada.
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toContainText('¿Mover 3 tareas a «En revisión»?');
    await dialogo.getByRole('button', { name: 'Mover tareas' }).click();

    for (const titulo of titulos) {
      await expect(enRevision.locator(tarjeta(page, titulo))).toBeVisible({ timeout: 15_000 });
    }
    await expect(porHacer.locator(tarjeta(page, titulos[0]))).toHaveCount(0);
    // Tras la acción la selección se limpia y la barra desaparece.
    await expect(barra).toBeHidden();

    // Persistió en el backend, no es solo estado del cliente.
    await page.reload();
    for (const titulo of titulos) {
      await expect(enRevision.locator(tarjeta(page, titulo))).toBeVisible({ timeout: 15_000 });
    }
  });

  test('Esc limpia la selección sin aplicar ninguna acción', async ({ page }) => {
    await page.goto(`/dashboard/projects/${idProyecto}/kanban`);
    await expect(tarjeta(page, titulos[0])).toBeVisible({ timeout: 15_000 });

    await tarjeta(page, titulos[0]).hover();
    await page.getByRole('checkbox', { name: `Seleccionar "${titulos[0]}"` }).click();
    const barra = page.getByRole('toolbar', { name: 'Acciones masivas' });
    await expect(barra).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(barra).toBeHidden();
    await expect(tarjeta(page, titulos[0])).toHaveAttribute('data-seleccionada', 'false');
  });
});
