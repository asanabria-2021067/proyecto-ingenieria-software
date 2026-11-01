import { expect, type Page } from '@playwright/test';

/** Enlace «Mensajes» de la barra superior: lleva a /dashboard/mensajes (el botón flotante de móvil no tiene title). */
export const iconoMensajes = (page: Page) => page.getByTitle('Mensajes', { exact: true });

/**
 * Garantiza que exista el chat individual con `nombreOtro` y lo deja abierto en /dashboard/mensajes:
 * lo abre desde la lista si ya existe y, si no, lo crea con «Nuevo chat».
 */
export async function asegurarChatCon(page: Page, nombreOtro: string): Promise<void> {
  await iconoMensajes(page).click();
  await expect(page).toHaveURL(/\/dashboard\/mensajes$/);
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });
  if (await existente.count()) {
    await existente.first().click();
    return;
  }
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}
