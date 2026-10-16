import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

// Mismo par real del Proyecto 1 del seed que usa chat-mensajeria.spec.ts.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';

/** Abre (o crea) el chat individual con `nombreOtro` desde el dock global. */
async function abrirChatIndividualCon(page: Page, nombreOtro: string) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });

  if (await existente.count()) {
    await existente.first().click();
    return;
  }

  await page.getByRole('button', { name: /^mensajes/i }).click(); // cierra la lista, vacía
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

test('escribiendo y visto por entre dos usuarios, sin recargar', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, CORREO_A);
    await login(pageB, CORREO_B);
    await pageA.goto(`/dashboard/projects/${PROYECTO_ID}`);
    await pageB.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

    // Ambos con la ventana abierta: así los dos están en la room de la conversación.
    await abrirChatIndividualCon(pageA, 'María');
    await abrirChatIndividualCon(pageB, 'Carlos');
    const inputA = pageA.getByPlaceholder('Escribe un mensaje…');
    const inputB = pageB.getByPlaceholder('Escribe un mensaje…');
    await expect(inputB).toBeVisible();

    // A teclea (sin enviar): B ve "escribiendo" y se apaga solo (~4 s).
    await inputA.pressSequentially('Hola', { delay: 50 });
    await expect(pageB.getByRole('status').filter({ hasText: 'está escribiendo' })).toContainText('Carlos');
    await expect(pageB.getByRole('status').filter({ hasText: 'está escribiendo' })).toHaveCount(0, { timeout: 8_000 });

    // A envía: B (ventana abierta) lo recibe y lo marca leído; A ve "Visto por María".
    const mensaje = `Visto ${test.info().workerIndex}-${Math.random().toString(36).slice(2)}`;
    await inputA.fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageB.getByText(mensaje).first()).toBeVisible();
    await expect(pageA.getByTestId('chat-visto-por')).toContainText('Visto por María', { timeout: 10_000 });

    // B teclea: A ve "María está escribiendo".
    await inputB.pressSequentially('Respon', { delay: 50 });
    await expect(pageA.getByRole('status').filter({ hasText: 'está escribiendo' })).toContainText('María');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
