import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { analizarAccesibilidad, describirViolaciones } from './support/a11y';
import { api, enDias, marca, overflowHorizontal, retirarDeudaCspDelMapa } from './support/calendario';
import { desactivarTour } from './support/realtime';

/**
 * HU-195 (T-363): un administrador programa, consulta, edita y cancela una
 * reunión de Administración desde el Calendario de Sprints, contra el backend
 * real: proyectos elegibles reales, una sola reunión para varios equipos y
 * los equipos que resuelve el backend. Si `CAPTURAS_REUNIONES` apunta a una
 * carpeta, guarda ahí la evidencia visual de cada paso.
 */
const ADMIN = 'admin@uvg.edu.gt';

const clave = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

async function captura(page: Page, testInfo: TestInfo, nombre: string) {
  // La evidencia se toma con las transiciones terminadas (apertura del modal, cierre del buscador);
  // las animaciones infinitas (esqueletos) no se esperan.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const carpeta = process.env.CAPTURAS_REUNIONES;
  const destino = carpeta ? path.join(carpeta, `${nombre}.png`) : testInfo.outputPath(`${nombre}.png`);
  await page.screenshot({ path: destino });
}

test.describe('Reuniones de Administración: programar, editar y cancelar desde el calendario (HU-195)', () => {
  test.setTimeout(180_000);

  test('flujo completo con varios proyectos, detalles del equipo, edición y cancelación', async ({ page, cspViolations }, testInfo) => {
    await desactivarTour(page);
    await login(page, ADMIN, '/dashboard/admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    const dia = enDias(3, 9);
    const titulo = marca(testInfo, 'E2E reunión UI');
    let idReunion: number | null = null;

    try {
      // 1. Calendario con «Programar reunión» y el día elegido.
      await page.goto(`/dashboard/admin/sprints?vista=semana&fecha=${clave(dia)}`);
      await expect(page.getByRole('button', { name: 'Programar reunión', exact: true })).toBeVisible({ timeout: 15_000 });
      await captura(page, testInfo, '01-calendario-programar-reunion');

      // 2. Modal vacío, abierto desde el día elegido (09:00).
      await page.getByRole('button', { name: 'Programar reunión este día' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Programar reunión administrativa' });
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByLabel('Hora de inicio')).toHaveValue('09:00');
      await captura(page, testInfo, '02-modal-vacio');
      const axe = await analizarAccesibilidad(page, testInfo, 'modal-reunion-admin');
      expect(describirViolaciones(axe.bloqueantes), 'modal de reunión').toEqual([]);

      await dialogo.getByLabel('Título de la reunión').fill(titulo);
      await dialogo.getByRole('button', { name: 'Agregar descripción' }).click();
      await dialogo.getByLabel('Descripción (opcional)').fill('Revisión de avances de varios equipos.');

      // 3–5. Selector de proyectos elegibles reales; uno y luego hasta tres seleccionados.
      await dialogo.getByRole('button', { name: /Buscar proyecto para invitar/ }).click();
      const opciones = page.getByRole('option');
      await expect(opciones.first()).toBeVisible({ timeout: 15_000 });
      const disponibles = await opciones.count();
      expect(disponibles, 'el seed debe tener al menos un proyecto convocable').toBeGreaterThan(0);
      await captura(page, testInfo, '03-selector-proyectos');
      await opciones.first().click();
      const seleccion = dialogo.getByRole('list', { name: 'Proyectos seleccionados' });
      await expect(seleccion.getByRole('listitem')).toHaveCount(1);
      await expect(seleccion).toContainText('Líder:');
      await captura(page, testInfo, '04-un-proyecto');
      const objetivo = Math.min(3, disponibles);
      for (let i = 1; i < objetivo; i += 1) {
        await dialogo.getByRole('button', { name: 'Agregar otro proyecto' }).click();
        await page.getByRole('option').first().click();
      }
      await expect(seleccion.getByRole('listitem')).toHaveCount(objetivo);
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(dialogo.getByText(objetivo === 1 ? '1 proyecto seleccionado' : `${objetivo} proyectos seleccionados`)).toBeVisible();
      await captura(page, testInfo, '05-varios-proyectos');

      // 6. Detalles del equipo (backend real) dentro de la tarjeta.
      const verDetalles = seleccion.getByRole('button', { name: /^Ver detalles de / }).first();
      await verDetalles.click();
      await expect(seleccion.getByText('Estudiantes participantes').first()).toBeVisible({ timeout: 15_000 });
      await expect(seleccion.getByText('Líder del proyecto').first()).toBeVisible();
      await captura(page, testInfo, '06-detalles-expandidos');

      // 7–9. Las tres modalidades con su enlace y/o el mapa existente.
      await dialogo.getByRole('radio', { name: 'Presencial' }).click();
      await expect(dialogo.getByText('Ubicación presencial')).toBeVisible();
      // Las teselas vienen de OpenStreetMap: sin red, la evidencia muestra el mapa sin fondo.
      await dialogo.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
      await captura(page, testInfo, '08-modalidad-presencial');
      await dialogo.getByRole('radio', { name: 'Híbrida' }).click();
      await expect(dialogo.getByLabel('Enlace de conexión virtual')).toBeVisible();
      await expect(dialogo.getByText('Ubicación presencial')).toBeVisible();
      await captura(page, testInfo, '09-modalidad-hibrida');
      // El mapa existente trae la deuda CSP ya documentada (teselas de OpenStreetMap): solo esa se retira.
      testInfo.annotations.push({ type: 'csp-mapa', description: retirarDeudaCspDelMapa(cspViolations, '/dashboard/admin/sprints').join(', ') });
      await dialogo.getByRole('radio', { name: 'Virtual' }).click();
      await dialogo.getByLabel('Enlace de conexión virtual').fill('https://meet.google.com/e2e-admin-gestion');
      await expect(dialogo.getByText('Ubicación presencial')).toHaveCount(0);
      await captura(page, testInfo, '07-modalidad-virtual');

      // Programar: una sola reunión para todos los proyectos.
      const respuesta = page.waitForResponse((r) => r.url().includes('/api/admin/reuniones') && r.request().method() === 'POST');
      await dialogo.getByRole('button', { name: 'Programar reunión' }).click();
      const creada = await respuesta;
      expect(creada.status()).toBe(201);
      const cuerpo = (await creada.json()) as { idReunion: number; proyectos: unknown[] };
      idReunion = cuerpo.idReunion;
      expect(cuerpo.proyectos).toHaveLength(objetivo);
      await expect(dialogo).toBeHidden();

      // 10–11. Una sola entrada en el calendario y su detalle.
      const bloque = page.getByRole('button', { name: `${titulo}, 09:00 a 10:00` });
      await expect(bloque).toHaveCount(1, { timeout: 15_000 });
      await bloque.click();
      const tarjeta = page.locator('li[aria-current="true"]');
      await expect(tarjeta).toContainText(titulo);
      await expect(tarjeta).toContainText('Revisión de avances de varios equipos.');
      await expect(tarjeta).toContainText(objetivo === 1 ? '1 equipo' : `${objetivo} equipos`);
      await expect(tarjeta).toContainText('Programada');
      await captura(page, testInfo, '10-reunion-en-calendario');
      await tarjeta.scrollIntoViewIfNeeded();
      await captura(page, testInfo, '11-detalle-reunion');

      // 12. Edición: precarga y guarda el cambio.
      await tarjeta.getByRole('button', { name: `Editar reunión ${titulo}` }).click();
      const edicion = page.getByRole('dialog', { name: 'Editar reunión administrativa' });
      await expect(edicion.getByLabel('Título de la reunión')).toHaveValue(titulo, { timeout: 15_000 });
      await expect(edicion.getByRole('list', { name: 'Proyectos seleccionados' }).getByRole('listitem')).toHaveCount(objetivo);
      await captura(page, testInfo, '12-formulario-edicion');
      const nuevoTitulo = `${titulo} (editada)`;
      await edicion.getByLabel('Título de la reunión').fill(nuevoTitulo);
      await edicion.getByLabel('Hora de fin').fill('10:30');
      await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(edicion).toBeHidden({ timeout: 15_000 });
      const editada = page.getByRole('button', { name: `${nuevoTitulo}, 09:00 a 10:30` });
      await expect(editada).toBeVisible({ timeout: 15_000 });

      // 14–15. Modal en oscuro y en móvil, sin desbordarse.
      await editada.click();
      await page.evaluate(() => localStorage.setItem('theme', 'dark'));
      await page.reload();
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
      await page.getByRole('button', { name: 'Programar reunión', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Programar reunión administrativa' })).toBeVisible();
      await captura(page, testInfo, '14-modal-oscuro');
      await page.keyboard.press('Escape');
      await page.evaluate(() => localStorage.setItem('theme', 'light'));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.getByRole('button', { name: 'Programar reunión', exact: true }).click();
      const movil = page.getByRole('dialog', { name: 'Programar reunión administrativa' });
      await expect(movil).toBeVisible();
      await expect(movil.getByRole('button', { name: 'Programar reunión' })).toBeInViewport();
      expect(await overflowHorizontal(page)).toBeLessThanOrEqual(0);
      await captura(page, testInfo, '15-modal-movil');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });

      // 13. Cancelación con confirmación: conservar no cancela; confirmar la saca de la agenda.
      await page.goto(`/dashboard/admin/sprints?vista=semana&fecha=${clave(dia)}`);
      await page.getByRole('button', { name: `${nuevoTitulo}, 09:00 a 10:30` }).click();
      const elegida = page.locator('li[aria-current="true"]');
      await elegida.getByRole('button', { name: `Cancelar reunión ${nuevoTitulo}` }).click();
      const confirmacion = page.getByRole('alertdialog', { name: '¿Cancelar la reunión?' });
      await expect(confirmacion).toContainText('recibirán el aviso de cancelación');
      await captura(page, testInfo, '13-confirmar-cancelacion');
      await confirmacion.getByRole('button', { name: 'Conservar reunión' }).click();
      await expect(page.getByRole('button', { name: `${nuevoTitulo}, 09:00 a 10:30` })).toBeVisible();
      await elegida.getByRole('button', { name: `Cancelar reunión ${nuevoTitulo}` }).click();
      const cancelacion = page.waitForResponse((r) => r.url().includes(`/api/admin/reuniones/${idReunion}`) && r.request().method() === 'DELETE');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar cancelación' }).click();
      expect((await cancelacion).status()).toBe(200);
      await expect(page.getByText(nuevoTitulo)).toHaveCount(0, { timeout: 15_000 });
      const estado = await api(page, 'get', `/api/admin/reuniones/${idReunion}`);
      expect(((await estado.json()) as { estado: string }).estado).toBe('CANCELADA');
      idReunion = null;
    } finally {
      await page.evaluate(() => localStorage.setItem('theme', 'light')).catch(() => undefined);
      if (idReunion !== null) await api(page, 'delete', `/api/admin/reuniones/${idReunion}`);
    }
  });
});
