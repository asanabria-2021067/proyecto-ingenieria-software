import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';
import { TAGS_WCAG } from './support/a11y';

/**
 * IESUC-568 (B3, NeuroLab): el aviso en vivo de una notificación se ve, cumple
 * contraste AA en claro y oscuro, dura al menos 8 s y se pausa con el puntero.
 * Mismo disparador real que realtime-notificacion.spec.ts: Carlos comenta la
 * tarea 1 y María (su asignada activa) recibe el aviso por socket.
 */

test.describe.configure({ timeout: 90_000 });

const PROYECTO_ID = 1;
const TAREA_ID = 1;
const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const MARIA = 'maria.lopez@uvg.edu.gt';

async function abrirSesiones(browser: Browser, tema: 'light' | 'dark') {
  const contextoLider = await browser.newContext();
  const contextoAsignada = await browser.newContext();
  const lider = await contextoLider.newPage();
  const asignada = await contextoAsignada.newPage();
  await desactivarTour(lider);
  await desactivarTour(asignada);
  await asignada.addInitScript((t) => localStorage.setItem('theme', t), tema);
  await login(lider, CARLOS);
  await login(asignada, MARIA);
  await asignada.goto('/dashboard');
  await lider.goto(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}?section=comments`);
  return { lider, asignada, cerrar: () => Promise.all([contextoLider.close(), contextoAsignada.close()]) };
}

async function comentar(lider: Page) {
  const texto = `Aviso en vivo ${Math.random().toString(36).slice(2)}`;
  await lider.getByPlaceholder('Escribe un comentario...').fill(texto);
  await lider.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(lider.getByText(texto).first()).toBeVisible();
}

function avisoDe(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Nuevo comentario' }).first();
}

for (const tema of ['light', 'dark'] as const) {
  test(`tema ${tema}: el aviso en vivo cumple contraste AA y es un status accesible`, async ({ browser }) => {
    const { lider, asignada, cerrar } = await abrirSesiones(browser, tema);
    try {
      await comentar(lider);
      const aviso = avisoDe(asignada);
      await expect(aviso).toBeVisible({ timeout: 15_000 });
      await expect(aviso).toHaveAttribute('aria-live', 'polite');
      // El contraste se mide con el aviso ya opaco: durante la animación de
      // entrada axe vería colores mezclados con el fondo, no los del tema.
      const toast = asignada.locator('[data-sonner-toast]').filter({ has: aviso });
      await expect
        .poll(() => toast.evaluate((el) => Number(getComputedStyle(el).opacity)))
        .toBe(1);

      const resultado = await new AxeBuilder({ page: asignada })
        .include('[data-sonner-toast]')
        .withTags([...TAGS_WCAG])
        .analyze();
      const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary).join(' | ')}`)).toEqual([]);
    } finally {
      await cerrar();
    }
  });
}

test('el aviso dura al menos 8 s y se pausa mientras el puntero está encima', async ({ browser }) => {
  const { lider, asignada, cerrar } = await abrirSesiones(browser, 'light');
  try {
    await asignada.mouse.move(5, 400);
    await comentar(lider);
    const aviso = avisoDe(asignada);
    await expect(aviso).toBeVisible({ timeout: 15_000 });

    // Duración: medir el tiempo es el objetivo de esta prueba, por eso aquí sí se espera.
    await asignada.waitForTimeout(8_500);
    await expect(aviso).toBeVisible();

    await aviso.hover();
    await expect(aviso).toHaveAttribute('data-pausado', 'true');
    await asignada.waitForTimeout(3_000);
    await expect(aviso).toBeVisible();

    await asignada.mouse.move(5, 400);
    await expect(aviso).toBeHidden({ timeout: 5_000 });
  } finally {
    await cerrar();
  }
});
