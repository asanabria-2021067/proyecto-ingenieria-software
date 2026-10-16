import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';

// "Nuevo chat" aparece dos veces (lista del proyecto e icono del dock): exact evita la ambiguedad.
async function abrirChatConMaria(page: Page) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
  const existente = page.getByRole('button', { name: /María/ });
  if (await existente.count()) {
    await existente.first().click();
  } else {
    await page.getByRole('button', { name: 'Nuevo chat', exact: true }).click();
    await page.getByRole('button', { name: 'Individual' }).click();
    await page.getByRole('checkbox', { name: /María/ }).click();
    await page.getByRole('button', { name: 'Crear chat' }).click();
  }
}

// Cloudinary no esta disponible en local: el POST de subida y las URL firmadas
// se simulan con page.route; lo demas (chat, mensajes, sesion) va al backend real.
test('adjuntar un PDF, verlo en el mensaje, descargarlo y listarlo en la galeria', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return original.call(this, key);
    };
  });

  const adjunto = { idAdjunto: 901, nombreOriginal: 'informe-e2e.pdf', mime: 'application/pdf', tamanoBytes: 1024 };
  let urlPedida = 0;

  await login(page, CORREO_A);
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

  await abrirChatConMaria(page);

  await page.route('**/mensajes/archivo', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        idMensaje: 900001,
        idConversacion: 1,
        contenido: 'Adjunto de prueba',
        enviadoEn: new Date().toISOString(),
        remitente: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null },
        adjunto,
      }),
    });
  });
  await page.route('**/archivos/901/url', async (route) => {
    urlPedida += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://127.0.0.1:9/descarga-falsa', nombreOriginal: adjunto.nombreOriginal, mime: adjunto.mime, expiraEnSegundos: 60 }),
    });
  });
  await page.route(/\/archivos(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ ...adjunto, idMensaje: 900001, creadoEn: new Date().toISOString(), remitente: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null } }],
        nextCursor: null,
      }),
    });
  });

  // Validacion en cliente: un tipo no permitido se rechaza sin llegar al servidor.
  await page.getByTestId('adjunto-input').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(page.getByRole('alert')).toContainText('Tipo de archivo no permitido');

  await page.getByTestId('adjunto-input').setInputFiles({ name: adjunto.nombreOriginal, mimeType: adjunto.mime, buffer: Buffer.from('%PDF-1.7\n') });
  await expect(page.getByTestId('adjunto-previa')).toContainText(adjunto.nombreOriginal);
  await page.getByPlaceholder('Escribe un mensaje…').fill('Adjunto de prueba');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();

  await expect(page.getByText(adjunto.nombreOriginal).first()).toBeVisible();
  expect(urlPedida).toBe(0); // la URL firmada se pide solo al descargar

  const descarga = page.waitForRequest('**/archivos/901/url');
  await page.getByRole('button', { name: `Descargar ${adjunto.nombreOriginal}` }).first().click();
  await descarga;

  await page.getByRole('button', { name: 'Opciones de la conversación' }).click();
  await page.getByRole('menuitem', { name: 'Enlaces compartidos' }).click();
  await page.getByRole('tab', { name: 'Archivos' }).click();
  await expect(page.getByRole('dialog').getByText(adjunto.nombreOriginal)).toBeVisible();
});
