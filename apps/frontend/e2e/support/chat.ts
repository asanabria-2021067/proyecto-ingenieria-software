import type { Page } from '@playwright/test';

/** Botón «Mensajes» de la barra superior (en pantallas angostas, el flotante). */
export const iconoMensajes = (page: Page) => page.getByRole('button', { name: /^mensajes/i });

/**
 * Garantiza que exista el chat individual con `nombreOtro` y lo deja abierto: lo abre desde la
 * lista si ya existe y, si no, lo crea con «Nuevo chat» (que vive en la barra lateral del proyecto,
 * así que la página debe ser una vista de proyecto).
 */
export async function asegurarChatCon(page: Page, nombreOtro: string): Promise<void> {
  await iconoMensajes(page).click();
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });
  if (await existente.count()) {
    await existente.first().click();
    return;
  }
  await iconoMensajes(page).click(); // cierra la lista, vacía
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}
