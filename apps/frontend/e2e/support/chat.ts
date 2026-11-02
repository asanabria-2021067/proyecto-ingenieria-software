import { expect, type Page } from '@playwright/test';

/** Enlace «Mensajes» de la barra superior: lleva a /dashboard/mensajes. Se acota a la cabecera: la barra inferior móvil también lo titula. */
export const iconoMensajes = (page: Page) => page.locator('main > header').getByTitle('Mensajes', { exact: true });

/**
 * Crea el chat individual con `nombreOtro` desde «Nuevo chat» de la lista. El diálogo no trae proyecto fijo:
 * prueba cada proyecto hasta que el otro usuario aparece entre los miembros.
 */
async function crearChatIndividual(page: Page, nombreOtro: string): Promise<void> {
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  const proyecto = page.getByRole('combobox', { name: 'Proyecto' });
  const opciones = page.getByRole('option');
  const miembro = page.getByRole('checkbox', { name: new RegExp(nombreOtro) });
  await proyecto.click();
  await expect(opciones.first()).toBeVisible();
  const total = await opciones.count();
  for (let i = 0; i < total; i++) {
    if (i > 0) await proyecto.click();
    await opciones.nth(i).click();
    if (await miembro.waitFor({ timeout: 3_000 }).then(() => true, () => false)) break;
  }
  await miembro.click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

async function esperarLista(page: Page): Promise<void> {
  await expect(page.getByPlaceholder('Buscar mensajes')).toBeVisible();
  await expect(page.getByLabel('Cargando chats')).toBeHidden();
}

/**
 * Garantiza que exista el chat individual con `nombreOtro` y lo deja abierto en /dashboard/mensajes:
 * lo abre desde la lista si ya existe y, si no, lo crea con «Nuevo chat».
 */
export async function asegurarChatCon(page: Page, nombreOtro: string): Promise<void> {
  await iconoMensajes(page).click();
  await expect(page).toHaveURL(/\/dashboard\/mensajes$/);
  await esperarLista(page);
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });
  if (await existente.count()) {
    await existente.first().click();
    return;
  }
  await crearChatIndividual(page, nombreOtro);
}

/** Como asegurarChatCon pero entrando por URL (recarga completa: espera a que cargue la lista antes de decidir). */
export async function abrirChatIndividualCon(page: Page, nombreOtro: string): Promise<void> {
  await page.goto('/dashboard/mensajes');
  await esperarLista(page);
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });
  if (await existente.count()) {
    await existente.first().click();
    return;
  }
  await crearChatIndividual(page, nombreOtro);
}
