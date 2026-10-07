import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// carlos.mendoza lidera "Portal de Empleo UVG" (Proyecto 5 del seed), donde
// maria.lopez NO participa (ella solo está en el Proyecto 1). Así el evento
// solo puede llegarle a María a través del calendario compartido, no por ser
// integrante.
const CORREO_PROPIETARIO = 'carlos.mendoza@uvg.edu.gt';
const CORREO_INVITADA = 'maria.lopez@uvg.edu.gt';
const PROYECTO_AJENO = 'Portal de Empleo UVG';

async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

async function crearEvento(page: Page, titulo: string) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('button', { name: 'Agendar actividad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
  await dialogo.getByLabel('Proyecto', { exact: true }).click();
  await page.getByRole('option', { name: PROYECTO_AJENO }).click();
  await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
  await dialogo.getByLabel('Enlace de conexión virtual').fill('https://meet.google.com/e2e-compartido');
  await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
  await expect(page.getByText('Evento agendado')).toBeVisible();
}

async function abrirCompartir(page: Page) {
  await page.getByRole('button', { name: 'Compartir agenda' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Compartir mi agenda' });
  await expect(dialogo.getByText(/^Compartida con \(\d+\)$/)).toBeVisible();
  return dialogo;
}

test.describe('Calendario: compartir agenda (HU-184)', () => {
  test('comparto mi agenda y la otra persona la superpone a la suya, en solo lectura', async ({ page, browser }) => {
    const titulo = `E2E compartido ${Date.now()}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_PROPIETARIO);
    await crearEvento(page, titulo);

    // Compartir con María (si una corrida anterior la dejó compartida, se quita primero).
    let compartir = await abrirCompartir(page);
    const quitarPrevio = compartir.getByRole('button', { name: 'Dejar de compartir con María López' });
    if ((await quitarPrevio.count()) > 0) {
      await quitarPrevio.click();
      await expect(quitarPrevio).toHaveCount(0);
    }
    await compartir.getByLabel('Buscar persona').fill('María');
    await compartir.getByRole('button', { name: 'Compartir con María López' }).click();
    await expect(page.getByText('Agenda compartida')).toBeVisible();
    await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(compartir).toBeHidden();

    // María activa el calendario de Carlos (estilo Teams) y ve el evento superpuesto.
    const contexto = await browser.newContext();
    const paginaMaria = await contexto.newPage();
    try {
      await fijarRelojMananaTemprano(paginaMaria);
      await login(paginaMaria, CORREO_INVITADA);
      await paginaMaria.goto('/dashboard/calendario');

      const bloque = paginaMaria.getByRole('button', {
        name: new RegExp(`^${titulo}, 09:00 a 10:00, calendario de Carlos Mendoza`),
      });
      await expect(bloque).toHaveCount(0);

      await paginaMaria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' }).click();
      await expect(bloque).toBeVisible({ timeout: 15_000 });

      await bloque.click();
      const detalle = paginaMaria.getByRole('dialog', { name: titulo });
      await expect(detalle.getByText('Calendario de Carlos Mendoza · solo lectura')).toBeVisible();
      await expect(detalle.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
      await expect(detalle.getByRole('button', { name: 'Eliminar evento' })).toHaveCount(0);
    } finally {
      await contexto.close();
    }

    // Limpieza: Carlos deja de compartir (reversible, sin confirmación).
    compartir = await abrirCompartir(page);
    await compartir.getByRole('button', { name: 'Dejar de compartir con María López' }).click();
    await expect(page.getByText('Dejaste de compartir tu agenda')).toBeVisible();
    await page.keyboard.press('Escape');

    // ...y elimina el evento de prueba para no dejarlo en la base.
    await page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) }).click();
    await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
    await expect(page.getByText('Evento eliminado')).toBeVisible();
  });
});
