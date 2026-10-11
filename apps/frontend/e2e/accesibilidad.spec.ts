import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { analizarAccesibilidad, describirViolaciones } from './support/a11y';
import { desactivarTour } from './support/realtime';

/**
 * T-318 (FG11): comprobación automática con axe dentro de la suite E2E.
 *
 * Las cinco pantallas de la auditoría de T-316
 * (docs/qa/sprint9/a11y-screen-inventory.md), con sesión autenticada, en tema
 * claro y oscuro: 10 combinaciones. El test falla si axe encuentra una
 * violación de impacto `serious` o `critical` en las reglas WCAG 2.0/2.1 A y
 * AA. No hay exclusiones ni reglas desactivadas.
 *
 * Solo lectura: no crea ni modifica datos. Cada análisis se adjunta al
 * reporte como `a11y-<pantalla>-<tema>.json`.
 */

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';

export const PANTALLAS_A11Y = [
  { id: 'dashboard-estudiante', ruta: '/dashboard', correo: ESTUDIANTE },
  { id: 'dashboard-admin', ruta: '/dashboard/admin', correo: ADMIN },
  { id: 'proyectos-admin', ruta: '/dashboard/admin/proyectos?grupo=activos', correo: ADMIN },
  { id: 'calendario', ruta: '/dashboard/calendario', correo: ESTUDIANTE },
  { id: 'perfil-editar', ruta: '/dashboard/perfil/editar', correo: ESTUDIANTE },
] as const;

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  await login(page, correo);
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

/** Abre la pantalla en el tema pedido y espera a que esté estable antes de analizarla. */
async function abrirEnTema(page: Page, ruta: string, oscuro: boolean) {
  // El tema se fija antes de cargar la pantalla: así no se analiza a mitad de una transición.
  await page.evaluate((tema) => localStorage.setItem('theme', tema), oscuro ? 'dark' : 'light');
  await page.goto(ruta);
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
  // La sesión sigue viva: se analiza la pantalla pedida, no el login.
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(ruta);
}

for (const pantalla of PANTALLAS_A11Y) {
  test.describe(`T-318: axe en ${pantalla.id}`, () => {
    for (const oscuro of [false, true]) {
      const tema = oscuro ? 'oscuro' : 'claro';

      test(`${tema}: sin violaciones graves ni críticas de WCAG A/AA`, async ({ browser }, testInfo) => {
        const page = await sesion(browser, pantalla.correo);
        try {
          await abrirEnTema(page, pantalla.ruta, oscuro);
          const { violaciones, bloqueantes } = await analizarAccesibilidad(page, testInfo, `${pantalla.id}-${tema}`);

          // Lo que no bloquea queda a la vista en el reporte, no escondido.
          testInfo.annotations.push({
            type: 'a11y',
            description: `${pantalla.id} ${tema}: ${violaciones.length} violación(es), ${bloqueantes.length} bloqueante(s)`,
          });
          expect(describirViolaciones(bloqueantes), `violaciones graves o críticas en ${pantalla.ruta} (${tema})`).toEqual([]);
        } finally {
          await page.evaluate(() => localStorage.setItem('theme', 'light')).catch(() => undefined);
          await page.context().close();
        }
      });
    }
  });
}
