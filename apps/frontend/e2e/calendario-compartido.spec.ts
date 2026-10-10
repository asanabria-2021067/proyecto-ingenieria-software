import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// carlos.mendoza lidera "Portal de Empleo UVG" (Proyecto 5 del seed), donde
// maria.lopez NO participa (ella solo está en el Proyecto 1). G01 (UI-01):
// por eso María, aunque Carlos le comparta su agenda, solo puede ver ese
// evento como "Ocupado" (horario sin título, proyecto, link ni descripción).
const CORREO_PROPIETARIO = 'carlos.mendoza@uvg.edu.gt';
const CORREO_INVITADA = 'maria.lopez@uvg.edu.gt';
const PROYECTO_AJENO = 'Portal de Empleo UVG';
const LINK_PRIVADO = 'https://meet.google.com/e2e-compartido';
const DESCRIPCION_PRIVADA = 'SECRETO E2E: notas privadas del proyecto';
const RUTA_AGENDA = /\/api\/usuarios\/me\/calendario\/compartidos-conmigo\/\d+\/agenda/;

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
  await dialogo.getByRole('button', { name: 'Agregar descripción' }).click();
  await dialogo.getByLabel('Descripción (opcional)').fill(DESCRIPCION_PRIVADA);
  await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK_PRIVADO);
  await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
  await expect(page.getByText('Evento agendado')).toBeVisible();
}

async function abrirCompartir(page: Page) {
  await page.getByRole('button', { name: 'Compartir agenda' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Compartir mi agenda' });
  await expect(dialogo.getByText(/^Compartida con \(\d+\)$/)).toBeVisible();
  return dialogo;
}

async function eliminarEvento(page: Page, titulo: string) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('radio', { name: 'Día' }).click();
  await page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) }).click();
  await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
  await expect(page.getByText('Evento eliminado')).toBeVisible();
}

test.describe('Calendario: compartir agenda (HU-184, G01 UI-01/UI-31)', () => {
  test('la agenda compartida solo expone disponibilidad de proyectos ajenos y el receptor puede quitársela', async ({ page, browser }) => {
    const titulo = `E2E compartido ${Date.now()}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_PROPIETARIO);
    await crearEvento(page, titulo);

    try {
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

      const contexto = await browser.newContext();
      const paginaMaria = await contexto.newPage();
      try {
        await fijarRelojMananaTemprano(paginaMaria);
        await login(paginaMaria, CORREO_INVITADA);
        await paginaMaria.goto('/dashboard/calendario');
        await paginaMaria.getByRole('radio', { name: 'Día' }).click();

        // Antes de activar el calendario de Carlos no hay nada suyo en pantalla.
        const bloque = paginaMaria.getByRole('button', { name: /^Ocupado, 09:00 a 10:00, calendario de Carlos Mendoza/ });
        await expect(bloque).toHaveCount(0);

        // G01 (UI-01): el JSON de red de la agenda compartida es el contrato mínimo, no el evento completo.
        const respuesta = paginaMaria.waitForResponse((r) => RUTA_AGENDA.test(r.url()) && r.request().method() === 'GET');
        await paginaMaria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' }).click();
        const agenda = await respuesta;
        expect(agenda.status()).toBe(200);
        const cuerpo = await agenda.text();
        for (const privado of [titulo, LINK_PRIVADO, DESCRIPCION_PRIVADA, PROYECTO_AJENO, 'linkSesion', 'descripcionEvento', 'invitados']) {
          expect(cuerpo).not.toContain(privado);
        }
        const json = JSON.parse(cuerpo) as { eventos: { visibilidad: string; tituloEvento?: string }[] };
        expect(json.eventos.some((e) => e.visibilidad === 'OCUPADO')).toBe(true);
        expect(json.eventos.every((e) => e.visibilidad !== 'OCUPADO' || e.tituloEvento === undefined)).toBe(true);

        // En pantalla: solo "Ocupado" y el horario; el detalle no muestra nada privado.
        await expect(bloque).toBeVisible({ timeout: 15_000 });
        await bloque.click();
        const detalle = paginaMaria.getByRole('dialog', { name: 'Ocupado' });
        await expect(detalle.getByText('Calendario de Carlos Mendoza · solo lectura')).toBeVisible();
        await expect(detalle.getByText(titulo)).toHaveCount(0);
        await expect(detalle.getByText('Link de la sesión')).toHaveCount(0);
        await expect(detalle.getByText('Descripción')).toHaveCount(0);
        await expect(detalle.getByText(PROYECTO_AJENO)).toHaveCount(0);
        await expect(detalle.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
        await expect(detalle.getByRole('button', { name: 'Eliminar evento' })).toHaveCount(0);
        await paginaMaria.keyboard.press('Escape');

        // G01 (UI-31): María se quita el calendario; después el backend le niega la agenda.
        await paginaMaria.getByRole('button', { name: 'Quitar el calendario de Carlos Mendoza' }).click();
        await expect(paginaMaria.getByText('Calendario quitado')).toBeVisible();
        await expect(paginaMaria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' })).toHaveCount(0);
        await expect(bloque).toHaveCount(0);
        const idPropietario = agenda.url().match(/compartidos-conmigo\/(\d+)\/agenda/)?.[1];
        const denegada = await paginaMaria.request.get(
          `/api/usuarios/me/calendario/compartidos-conmigo/${idPropietario}/agenda?desde=${encodeURIComponent(new Date().toISOString())}&hasta=${encodeURIComponent(new Date(Date.now() + 7 * 86_400_000).toISOString())}`,
        );
        expect(denegada.status()).toBe(403);
      } finally {
        await contexto.close();
      }

      // Carlos ya no la ve en "Compartida con" (la revocación fue de María).
      compartir = await abrirCompartir(page);
      await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toHaveCount(0);
      await page.keyboard.press('Escape');
    } finally {
      // Limpieza: el evento de prueba no se queda en la base.
      await eliminarEvento(page, titulo);
    }
  });
});
