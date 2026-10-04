import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// T-334 (HU-187): notificación en tiempo real entre dos usuarios reales,
// mismo patrón de dos contextos que chat-mensajeria.spec.ts. carlos.mendoza
// (líder del Proyecto 1) comenta la tarea 1 ("Crear mockups en Figma"),
// cuyo único asignado activo en el seed es maria.lopez — el comentario
// notifica al asignado activo (ver getTaskCommentRecipientIds en
// comentarios.service.ts), nunca al autor.
const PROYECTO_ID = 1;
const TAREA_ID = 1;
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CORREO_ASIGNADA = 'maria.lopez@uvg.edu.gt';

async function desactivarTour(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });
}

test('un usuario comenta una tarea y el asignado ve la notificación sin recargar', async ({ browser }) => {
  test.setTimeout(60_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, CORREO_LIDER);
    await login(pageB, CORREO_ASIGNADA);

    // B se queda en el dashboard: el socket de /notifications vive en
    // DashboardLayout, montado en cualquier página del área /dashboard.
    await pageB.goto('/dashboard');

    await pageA.goto(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}?section=comments`);
