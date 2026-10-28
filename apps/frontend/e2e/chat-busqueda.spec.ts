import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// Mismo par real del Proyecto 1 del seed que chat-mensajeria.spec.ts.
const PROYECTO_ID = 1;
const CORREO = 'carlos.mendoza@uvg.edu.gt';

// El tour de onboarding intercepta clicks; se neutraliza como en chat-mensajeria.spec.ts.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

async function abrirChatIndividualCon(page: Page, nombreOtro: string) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });

  if (await existente.count()) {
    await existente.first().click();
    return;
  }

  await page.getByRole('button', { name: /^mensajes/i }).click();
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

async function enviar(page: Page, texto: string) {
  await page.getByPlaceholder('Escribe un mensaje…').fill(texto);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText(texto).first()).toBeVisible();
}

test('busca en un chat por texto sin acentos, filtra por autor y salta al mensaje', async ({ page }) => {
  test.setTimeout(60_000);
  await desactivarTour(page);
  await login(page, CORREO);
  await page.goto(`/dashboard/projects/${PROYECTO_ID}`);
  await abrirChatIndividualCon(page, 'María');

  // Marca unica por corrida para no chocar con mensajes de otras ejecuciones.
  const marca = `zeta${Date.now().toString(36)}`;
  await enviar(page, `Revisamos la planificación ${marca}`);
  await enviar(page, `Mensaje sin relación`);

  await page.getByRole('button', { name: 'Buscar en la conversación' }).click();
  const buscador = page.getByRole('region', { name: 'Buscar en la conversación' });

  // Sin filtros: validacion.
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(buscador.getByRole('alert')).toContainText('Escribe un texto');

  // Texto sin acento encuentra "planificación" y lo resalta con <mark>.
  await buscador.getByLabel('Buscar texto en la conversación').fill(`planificacion ${marca}`);
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click();
  const resultados = buscador.getByRole('list', { name: 'Resultados de la búsqueda' });
  await expect(resultados.getByRole('listitem')).toHaveCount(1);
  await expect(resultados.locator('mark')).toHaveText(`planificación ${marca}`);

  // Autor: el mensaje es de Carlos (yo); filtrar por María no devuelve nada.
  const idMaria = await buscador.getByLabel('Autor').locator('option', { hasText: 'María' }).getAttribute('value');
  await buscador.getByLabel('Autor').selectOption(idMaria!);
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(buscador.getByText('No hay mensajes que coincidan')).toBeVisible();

  // Rango de fechas: un dia pasado no devuelve nada; hoy si.
  await buscador.getByLabel('Autor').selectOption({ label: 'Cualquiera' });
  await buscador.getByLabel('Desde').fill('2000-01-01');
  await buscador.getByLabel('Hasta').fill('2000-01-02');
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(buscador.getByText('No hay mensajes que coincidan')).toBeVisible();

  const hoy = new Date().toLocaleDateString('en-CA');
  await buscador.getByLabel('Desde').fill(hoy);
  await buscador.getByLabel('Hasta').fill(hoy);
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(resultados.getByRole('listitem')).toHaveCount(1);

  // Salto al mensaje: queda enfocado en la lista.
  await resultados.getByRole('button').first().click();
  const mensaje = page.locator('[data-mensaje]', { hasText: marca });
  await expect(mensaje).toBeFocused();
});
