import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * T-293 (FG12): los módulos diferidos llegan a demanda y la pantalla no se
 * rompe ni se mueve mientras tanto. Corre contra el build de producción.
 *
 * Cada módulo se reconoce por una cadena propia de su librería dentro del
 * chunk (los nombres de archivo cambian en cada build). Solo lectura.
 */

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';
const CHUNK = /\/_next\/static\/chunks\/[^?]+\.js/;

/** Registra los chunks de JS que contienen `marca`, a medida que el navegador los recibe. */
function vigilarChunks(page: Page, marca: string): string[] {
  const urls: string[] = [];
  page.on('response', (response) => {
    if (!CHUNK.test(response.url())) return;
    response
      .text()
      .then((body) => {
        if (body.includes(marca)) urls.push(new URL(response.url()).pathname);
      })
      .catch(() => undefined);
  });
  return urls;
}

/** Errores de página y de hidratación: un módulo diferido mal montado aparece aquí. */
function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on('pageerror', (error) => errores.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /hydrat|did not match|Minified React error/i.test(msg.text())) errores.push(msg.text());
  });
  return errores;
}

/** Abre la ruta y devuelve el HTML tal como lo entregó el servidor (antes de cualquier script). */
async function htmlInicial(page: Page, ruta: string): Promise<string> {
  const response = await page.goto(ruta);
  return (await response?.text()) ?? '';
}

async function sesion(browser: Browser, correo: string, conTour = false): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (!conTour) await desactivarTour(page);
  await login(page, correo);
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

test.describe('T-293: carga diferida', () => {
  test('panel admin: los gráficos llegan aparte y el título no se mueve al cargar', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      const errores = vigilarErrores(page);

      // Se retiene el chunk de recharts para observar el hueco con calma.
      let soltar!: () => void;
      const retenido = new Promise<void>((resolve) => (soltar = resolve));
      const diferidos: string[] = [];
      await page.route(CHUNK, async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes('recharts-wrapper')) {
          diferidos.push(new URL(route.request().url()).pathname);
          await retenido;
        }
        await route.fulfill({ response, body });
      });

      const html = await htmlInicial(page, '/dashboard/admin');
      const titulo = page.getByRole('heading', { name: 'Tendencias de uso' });
      await expect(titulo).toBeVisible();
      await expect.poll(() => diferidos.length).toBe(1);

      // Mientras no llega: el resto del panel ya se usa y el hueco se anuncia como ocupado.
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('#metricas section[aria-busy="true"]')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Periodo de las tendencias' })).toHaveCount(0);
      const antes = await titulo.boundingBox();

      soltar();
      const periodo = page.getByRole('group', { name: 'Periodo de las tendencias' });
      await expect(periodo).toBeVisible();
      const despues = await titulo.boundingBox();
      expect(despues?.y).toBe(antes?.y);
      expect(despues?.x).toBe(antes?.x);

      // El chunk no estaba entre los scripts del HTML inicial.
      expect(html).not.toContain(diferidos[0].split('/').pop()!);

      // Teclado: el control que llegó tarde se alcanza y responde.
      const mes = periodo.getByRole('radio', { name: 'Mes' });
      await mes.focus();
      await expect(mes).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(mes).toHaveAttribute('aria-checked', 'true');

      expect(errores).toEqual([]);
    } finally {
      await page.context().close();
    }
  });

  test('panel admin: llegar con #metricas desplaza hasta la sección', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      await page.goto('/dashboard/admin#metricas');
      await expect(page.getByRole('group', { name: 'Periodo de las tendencias' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tendencias de uso' })).toBeInViewport();
    } finally {
      await page.context().close();
    }
  });

  test('landing: las partículas llegan aparte y no hay errores de hidratación', async ({ page }) => {
    const errores = vigilarErrores(page);
    const diferidos = vigilarChunks(page, 'tsParticles');
    const html = await htmlInicial(page, '/');
    await expect(page.locator('h1').first()).toBeVisible();

    await expect.poll(() => diferidos.length).toBe(1);
    expect(html).not.toContain(diferidos[0].split('/').pop()!);

    // El fondo sigue pintándose en su sección.
    await expect(page.locator('#el-problema canvas')).toBeAttached();
    expect(errores).toEqual([]);
  });

  test('estudiante: la guía de bienvenida llega aparte y se sigue pudiendo abrir', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      const errores = vigilarErrores(page);
      const diferidos = vigilarChunks(page, 'react-joyride');
      const html = await htmlInicial(page, '/dashboard');
      await expect(page.locator('main h1').first()).toBeVisible();

      await expect.poll(() => diferidos.length).toBe(1);
      expect(html).not.toContain(diferidos[0].split('/').pop()!);

      // Ya vista, no se abre sola; pedida desde la ayuda, sí.
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Guía UVGenius')).toHaveCount(0);
      await page.evaluate(() => window.dispatchEvent(new Event('start-onboarding-tour')));
      await expect(page.getByText('Guía UVGenius')).toBeVisible();
      expect(errores).toEqual([]);
    } finally {
      await page.context().close();
    }
  });
});
