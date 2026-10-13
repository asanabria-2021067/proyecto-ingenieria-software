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
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

test.describe('T-293: carga diferida', () => {
  test('tendencias de uso: los gráficos llegan aparte y el título no se mueve al cargar', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      const errores = vigilarErrores(page);

      // La sección llega en dos tiempos: su propio módulo (título, selector de periodo y tarjetas)
      // y, dentro de ella, recharts (T-293 de HU-176). Cada chunk se reconoce por una cadena
      // propia y se retiene para observar su hueco con calma; si un build los uniera en un solo
      // archivo, las dos fases se resuelven con ese mismo chunk.
      const MARCAS = { seccion: 'Periodo de las tendencias', graficos: 'recharts-wrapper' } as const;
      const soltar: Record<keyof typeof MARCAS, () => void> = { seccion: () => undefined, graficos: () => undefined };
      const retenido = {
        seccion: new Promise<void>((resolve) => (soltar.seccion = resolve)),
        graficos: new Promise<void>((resolve) => (soltar.graficos = resolve)),
      };
      const diferidos: Record<keyof typeof MARCAS, string[]> = { seccion: [], graficos: [] };
      await page.route(CHUNK, async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        const esperas: Promise<void>[] = [];
        for (const fase of Object.keys(MARCAS) as (keyof typeof MARCAS)[]) {
          if (body.includes(MARCAS[fase])) {
            diferidos[fase].push(new URL(route.request().url()).pathname);
            esperas.push(retenido[fase]);
          }
        }
        await Promise.all(esperas);
        await route.fulfill({ response, body });
      });

      const html = await htmlInicial(page, '/dashboard/admin/metricas');
      const titulo = page.getByRole('heading', { level: 1, name: 'Tendencias de uso' });
      const periodo = page.getByRole('group', { name: 'Periodo de las tendencias' });
      const hueco = page.getByRole('status', { name: 'Cargando las tendencias de uso' });
      const graficos = page.locator('main .recharts-wrapper');
      await expect(titulo).toBeVisible();
      await expect.poll(() => diferidos.seccion.length).toBe(1);

      // Mientras no llega la sección: el titular ya está y el hueco se anuncia como carga.
      await expect(hueco).toBeVisible();
      await expect(periodo).toHaveCount(0);
      const antes = await titulo.boundingBox();

      // Llega la sección: el selector aparece y el título no se mueve. Los gráficos aún no.
      soltar.seccion();
      await expect.poll(() => diferidos.graficos.length).toBe(1);
      if (diferidos.graficos[0] !== diferidos.seccion[0]) {
        await expect(periodo).toBeVisible();
        await expect(hueco).toHaveCount(0);
        await expect(graficos).toHaveCount(0);
        expect((await titulo.boundingBox())?.y).toBe(antes?.y);
      }

      // Llegan los gráficos: se dibujan y el título sigue en su sitio.
      soltar.graficos();
      await expect(periodo).toBeVisible();
      await expect(graficos.first()).toBeVisible();
      const despues = await titulo.boundingBox();
      expect(despues?.y).toBe(antes?.y);
      expect(despues?.x).toBe(antes?.x);

      // Ninguno de los dos chunks estaba entre los scripts del HTML inicial.
      for (const ruta of [...diferidos.seccion, ...diferidos.graficos]) {
        expect(html).not.toContain(ruta.split('/').pop()!);
      }

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

  test('panel admin: su resumen de tendencias no descarga los gráficos', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      const errores = vigilarErrores(page);
      const graficos = vigilarChunks(page, 'recharts-wrapper');
      const metricas = page.waitForResponse((r) => r.url().includes('/api/admin/metricas') && r.status() === 200);

      await page.goto('/dashboard/admin');
      await metricas;
      const resumen = page.locator('#metricas');
      await expect(resumen.getByRole('group', { name: 'Usuarios nuevos' })).toBeVisible();
      await expect(resumen.getByRole('link', { name: 'Ver tendencias de uso' })).toBeVisible();
      await page.waitForLoadState('networkidle');

      // El panel se usa completo sin que recharts haya viajado: ni en el HTML inicial ni después.
      expect(graficos).toEqual([]);
      await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
      expect(errores).toEqual([]);
    } finally {
      await page.context().close();
    }
  });

  test('panel admin: llegar con #metricas desplaza hasta el resumen de tendencias', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      await page.goto('/dashboard/admin#metricas');
      const resumen = page.locator('#metricas');
      await expect(resumen.getByRole('link', { name: 'Ver tendencias de uso' })).toBeVisible();
      await expect(resumen.getByRole('heading', { name: 'Tendencias de uso' })).toBeInViewport();
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
