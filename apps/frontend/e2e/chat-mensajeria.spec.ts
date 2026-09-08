import { test, expect, type Page } from '@playwright/test';

// Ambos participan realmente en el Proyecto 1 del seed (carlos.mendoza es su
// líder y tiene además una participación de rol; maria.lopez tiene la
// participación de rol UX) — createConversation exige participación activa
// (o ser el líder) en el proyecto, así que estos dos son un par válido real.
const PROYECTO_ID = 1;
const CORREO_A = 'carlos.mendoza@uvg.edu.gt';
const CORREO_B = 'maria.lopez@uvg.edu.gt';
const PASSWORD = 'Test1234!';

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

async function login(page: Page, correo: string) {
  await page.goto('/login');
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByPlaceholder('Minimo 8 caracteres').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
  await page.waitForURL('**/dashboard');
}

/** Abre (o crea, si no existe todavía) la conversación individual con `nombreOtro`. */
async function abrirChatIndividualCon(page: Page, nombreOtro: string) {
  const existente = page
    .locator('aside')
    .getByRole('button', { name: new RegExp(nombreOtro) });

  if (await existente.count()) {
    await existente.first().click();
    return;
  }

  await page.getByLabel('Nuevo chat').click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

// smoke: chat en tiempo real entre dos usuarios reales del mismo proyecto
// (T-Fase3.3): A envía, B lo ve aparecer sin recargar la página.
test('un usuario envía un mensaje y el otro lo recibe sin recargar', async ({ browser }) => {
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

    await abrirChatIndividualCon(pageA, 'María');

    const marca = `${test.info().workerIndex}-${test.info().repeatEachIndex}-${Math.random().toString(36).slice(2)}`;
    const mensaje = `Hola desde A ${marca}`;

    await pageA.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
    await pageA.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(pageA.getByText(mensaje)).toBeVisible();

    // B nunca recarga: el mensaje debe llegarle por el socket de /chat,
    // ya sea abriendo el hilo desde la lista (conversationUpdated) o,
    // si ya lo tenía abierto, directamente (newMessage).
    await abrirChatIndividualCon(pageB, 'Carlos');
    await expect(pageB.getByText(mensaje)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
