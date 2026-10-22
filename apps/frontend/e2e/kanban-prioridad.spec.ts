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
  type Prioridad,
  type TareaCreada,
} from './support/kanban';

/**
 * HU-201/T-381: cada tarjeta del Kanban muestra su prioridad con una franja
 * de color, un icono y un texto, y expone «Prioridad alta/media/baja» al
 * lector de pantalla, así que la prioridad nunca depende solo del color.
 */

const CASOS: { prioridad: Prioridad; visible: string; accesible: string; franja: string }[] = [
  { prioridad: 'ALTA', visible: 'Alta', accesible: 'Prioridad alta', franja: 'bg-destructive' },
  { prioridad: 'MEDIA', visible: 'Media', accesible: 'Prioridad media', franja: 'bg-accent' },
  { prioridad: 'BAJA', visible: 'Baja', accesible: 'Prioridad baja', franja: 'bg-outline-variant' },
];

test.describe('HU-201: indicador de prioridad en las tarjetas del Kanban', () => {
  let idProyecto: number;
  let creadas: TareaCreada[] = [];
  const sufijo = Date.now();
  const titulo = (prioridad: Prioridad) => `HU-201 prioridad ${prioridad} ${sufijo}`;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await desactivarTour(page);
    await login(page, CORREO_LIDER);
    idProyecto = await idProyectoPorTitulo(page, PROYECTO_TUTORIAS);
    creadas = await crearTareas(
      page,
      idProyecto,
      CASOS.map(({ prioridad }) => ({ tituloTarea: titulo(prioridad), prioridad })),
    );
  });

  test.afterEach(async ({ page }) => {
    await eliminarTareas(page, idProyecto, creadas);
  });

  test('cada prioridad tiene franja, icono, texto visible y texto accesible propios', async ({ page }) => {
    await page.goto(`/dashboard/projects/${idProyecto}/kanban`);

    for (const caso of CASOS) {
      const card = tarjeta(page, titulo(caso.prioridad));
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toHaveAttribute('data-prioridad', caso.prioridad);

      // Franja de color: decorativa (aria-hidden), con el color de su prioridad.
      const franja = card.locator('[data-slot="prioridad-franja"]');
      await expect(franja).toHaveAttribute('aria-hidden', 'true');
      await expect(franja).toHaveClass(new RegExp(caso.franja));
      const ancho = await franja.evaluate((el) => el.getBoundingClientRect().width);
      expect(ancho).toBeGreaterThan(0);

      // Icono + palabra visible + texto para lector de pantalla.
      const indicador = card.locator('[data-slot="prioridad-indicador"]');
      await expect(indicador.locator('svg')).toHaveCount(1);
      await expect(indicador).toContainText(caso.visible);
      await expect(indicador.getByText(caso.accesible, { exact: true })).toHaveClass(/sr-only/);
    }
  });

  test('el texto accesible forma parte del árbol de accesibilidad de la tarjeta', async ({ page }) => {
    await page.goto(`/dashboard/projects/${idProyecto}/kanban`);

    const card = tarjeta(page, titulo('ALTA'));
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Lo que de verdad lee un lector de pantalla: «Prioridad alta», no «Alta» suelto.
    const arbol = await card.locator('[data-slot="prioridad-indicador"]').ariaSnapshot();
    expect(arbol).toContain('Prioridad alta');
  });
});
