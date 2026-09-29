import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

const PROYECTO_ID = 1;
// Proyecto 1 tiene tres participantes activos reales (carlos, maria, jose) —
// cada test usa un par distinto para no compartir conversación con los otros
// specs de chat que corren en paralelo (misma conversación = mensajes de un
// test apareciendo en las aserciones de otro).

// OnboardingTour (react-joyride) se activa por localStorage
// (`onboarding_seen_{idUsuario}`, ver OnboardingTour.tsx), nunca por estado
// del backend: en un contexto de navegador nuevo aparece para cualquier
// usuario con perfil completo y su overlay intercepta clicks del resto del
// test. Como cada `page.goto` en Next es una navegación completa (remonta la
// app entera), un dismiss por-click siempre corre la carrera contra su
// retardo interno de 800ms bajo carga. Se neutraliza en la raíz en vez de
// perseguir el botón: cualquier lectura de una key `onboarding_seen_*`
// responde 'true' desde antes de que corra el primer script de la página.
async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}


/**
 * Abre (o crea, si no existe todavía) la conversación individual con
 * `nombreOtro`. La lista de chats vive en el dock global (botón "Mensajes",
 * abajo a la derecha), no en el sidebar del proyecto — crear uno nuevo sí
 * sigue siendo una acción del proyecto ("Nuevo chat del proyecto").
 */
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

async function enviarMensaje(page: Page, texto: string) {
  await page.getByPlaceholder('Escribe un mensaje…').fill(texto);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
}

// Fase 3.4: concurrencia (ambos escriben casi simultáneamente, ninguno
// mensaje se pierde ni se descarta) y navegación (el chat vive en el layout
// del proyecto, así que cambiar de pestaña no debe cerrarlo ni perder el
// historial ya cargado).
test('concurrencia: ningún mensaje se pierde cuando ambos escriben casi al mismo tiempo', async ({ browser }) => {
  // Dos logins + dos sockets reales sobre el backend/frontend de dev
  // compartido de CI: el timeout por defecto (30s) no siempre alcanza bajo
  // esa carga compartida.
  test.setTimeout(60_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, 'carlos.mendoza@uvg.edu.gt');
    await login(pageB, 'jose.ramirez@uvg.edu.gt');

    await pageA.goto(`/dashboard/projects/${PROYECTO_ID}`);
    await pageB.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

    await abrirChatIndividualCon(pageA, 'José');
    await abrirChatIndividualCon(pageB, 'Carlos');

    const marca = Math.random().toString(36).slice(2);
    const mensajeA = `Concurrente-A-${marca}`;
    const mensajeB = `Concurrente-B-${marca}`;

    await Promise.all([enviarMensaje(pageA, mensajeA), enviarMensaje(pageB, mensajeB)]);

    // Ambos deben terminar viendo los dos mensajes, sin importar el orden de llegada.
    await expect(pageA.getByText(mensajeA).first()).toBeVisible();
    await expect(pageA.getByText(mensajeB).first()).toBeVisible();
    await expect(pageB.getByText(mensajeA).first()).toBeVisible();
    await expect(pageB.getByText(mensajeB).first()).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('navegación: cambiar de página no cierra el chat ni pierde el historial', async ({ page }) => {
  test.setTimeout(60_000);
  await desactivarTour(page);
  await login(page, 'maria.lopez@uvg.edu.gt');
  await page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);

  await abrirChatIndividualCon(page, 'José');

  const marca = Math.random().toString(36).slice(2);
  const mensaje = `Persistencia-${marca}`;
  await enviarMensaje(page, mensaje);
  await expect(page.getByText(mensaje).first()).toBeVisible();

  // El dock de chat es global (vive en el layout del dashboard, no en el
  // del proyecto): navegar a otra página, incluso fuera del proyecto, no
  // debe cerrar la ventana ni perder el historial ya cargado. Usa
  // navegación real de cliente (click, no page.goto): page.goto siempre
  // hace una recarga completa del navegador, que reinicia cualquier React
  // en memoria sin importar qué tan bien persista el layout — no es lo que
  // le pasa a un usuario real haciendo click dentro de la app.
  await page.getByRole('link', { name: /tablero/i }).click();
  await expect(page.getByText(mensaje).first()).toBeVisible();

  await page.getByRole('link', { name: 'Personas' }).click();
  await expect(page.getByText(mensaje).first()).toBeVisible();
});
