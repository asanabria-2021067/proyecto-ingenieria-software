import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * Cierre de Sprint 9 — métricas, gráficas y filtros administrativos en
 * 375, 768 y 1280 px, en tema claro y oscuro, contra la pila aislada.
 *
 *  - Panel Admin: el resumen de tendencias no dibuja gráficas, no se monta
 *    sobre el widget de Sprints y enlaza a la página (el acceso de móvil).
 *  - Tendencias de uso: una columna hasta `lg` y dos desde ahí, sin barra
 *    horizontal; tooltip y ejes con los colores del tema.
 *  - Eventos de seguridad: los cuatro controles miden lo mismo, el diálogo
 *    cabe en la pantalla y devuelve el foco al cerrarse.
 *  - Acceso: un estudiante no entra a la página de Tendencias.
 *
 * Solo lectura: no crea ni modifica datos.
 */

const ADMIN = 'admin@uvg.edu.gt';
const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const VIEWPORTS = [
  { ancho: 375, alto: 812 },
  { ancho: 768, alto: 1024 },
  { ancho: 1280, alto: 900 },
] as const;
const TEMAS = ['light', 'dark'] as const;

async function sesion(browser: Browser, correo: string, tema: (typeof TEMAS)[number] = 'light'): Promise<Page> {
  const contexto = await browser.newContext({ colorScheme: tema });
  // next-themes guarda el tema en localStorage y lo aplica como clase en <html>.
  await contexto.addInitScript((t) => {
    try {
      window.localStorage.setItem('theme', t);
    } catch {
      /* sin almacenamiento */
    }
  }, tema);
  const page = await contexto.newPage();
  await desactivarTour(page);
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return page;
}

/** Píxeles que el documento o el cuerpo desplazable de la vista sobresalen del ancho visible. */
function desborde(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cuerpo = document.querySelector('main > div.overflow-auto') ?? document.scrollingElement!;
    return Math.max(cuerpo.scrollWidth - cuerpo.clientWidth, document.documentElement.scrollWidth - window.innerWidth);
  });
}

/** Luminancia aproximada (0 oscuro, 1 claro) de un color `rgb(...)` calculado por el navegador. */
function luminancia(rgb: string): number {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

for (const tema of TEMAS) {
  for (const { ancho, alto } of VIEWPORTS) {
    test.describe(`${ancho} px · tema ${tema}`, () => {
      test('panel: resumen sin gráficas, sin montarse sobre los Sprints, que lleva a Tendencias', async ({ browser }) => {
        const page = await sesion(browser, ADMIN, tema);
        try {
          await page.setViewportSize({ width: ancho, height: alto });
          await page.goto('/dashboard/admin');
          const resumen = page.locator('#metricas');
          await expect(resumen.getByRole('group', { name: 'Usuarios nuevos' })).toBeVisible();
          await resumen.scrollIntoViewIfNeeded();

          await expect(resumen.getByRole('group')).toHaveCount(3);
          await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
          expect(await desborde(page)).toBeLessThanOrEqual(0);

          if (ancho >= 1280) {
            const [a, b] = await Promise.all([
              resumen.boundingBox(),
              page.getByRole('complementary', { name: 'Planificación de Sprints' }).boundingBox(),
            ]);
            expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1);
          }

          // En móvil la barra inferior no tiene Métricas: este enlace es el acceso.
          await resumen.getByRole('link', { name: 'Ver tendencias de uso' }).click();
          await page.waitForURL(/\/dashboard\/admin\/metricas$/);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tendencias de uso');
        } finally {
          await page.context().close();
        }
      });

      test('tendencias: columnas según el ancho, sin barra horizontal y con tooltip y ejes del tema', async ({ browser }) => {
        const page = await sesion(browser, ADMIN, tema);
        try {
          await page.setViewportSize({ width: ancho, height: alto });
          await page.goto('/dashboard/admin/metricas');
          await expect(page.getByRole('group', { name: 'Periodo de las tendencias' })).toBeVisible();

          const graficas = page.locator('main .recharts-wrapper');
          // Sin actividad en la ventana la vista muestra su estado vacío: no hay gráficas que medir.
          test.skip((await graficas.count()) === 0 && (await page.getByText('Aún no hay actividad para mostrar tendencias.').isVisible()), 'la base no tiene actividad en la ventana');
          await expect(graficas).toHaveCount(5);
          expect(await desborde(page)).toBeLessThanOrEqual(0);

          const columnas = await page.evaluate(
            () => new Set([...document.querySelectorAll('main .recharts-wrapper')].map((g) => Math.round(g.getBoundingClientRect().x))).size,
          );
          expect(columnas).toBe(ancho >= 1024 ? 2 : 1);

          if (ancho >= 768) {
            const menu = page.getByRole('navigation', { name: 'Navegación administrativa' });
            await expect(menu.locator('a[aria-current="page"]')).toHaveText(['Tendencias de uso']);
          } else {
            await expect(page.getByRole('navigation', { name: 'Navegación administrativa móvil' })).toBeVisible();
          }

          // Cada gráfica tiene su tabla de valores, oculta a la vista pero no al lector de pantalla.
          await expect(page.getByRole('table', { name: /^Usuarios nuevos por semana/ })).toBeAttached();

          const primera = graficas.first();
          await primera.scrollIntoViewIfNeeded();
          const caja = (await primera.boundingBox())!;
          await page.mouse.move(caja.x + caja.width * 0.6, caja.y + caja.height * 0.5);
          const tooltip = page.locator('.recharts-tooltip-wrapper > div').first();
          await expect(tooltip).toBeVisible();
          const fondo = luminancia(await tooltip.evaluate((el) => getComputedStyle(el).backgroundColor));
          const marcas = luminancia(await page.locator('.recharts-cartesian-axis-tick text').first().evaluate((el) => getComputedStyle(el).fill));
          // Claro: fondo claro y texto oscuro. Oscuro: al revés. Nunca una caja blanca sobre el tema oscuro.
          if (tema === 'dark') {
            expect(fondo).toBeLessThan(0.3);
            expect(marcas).toBeGreaterThan(0.5);
          } else {
            expect(fondo).toBeGreaterThan(0.7);
            expect(marcas).toBeLessThan(0.5);
          }
        } finally {
          await page.context().close();
        }
      });

      test('eventos de seguridad: controles del mismo alto, diálogo dentro de la pantalla y foco de vuelta', async ({ browser }) => {
        const page = await sesion(browser, ADMIN, tema);
        try {
          await page.setViewportSize({ width: ancho, height: alto });
          await page.goto('/dashboard/admin/seguridad');
          const filtros = page.getByRole('search', { name: 'Filtros de eventos de seguridad' });
          await expect(filtros).toBeVisible();
          expect(await desborde(page)).toBeLessThanOrEqual(0);

          const medidas = await page.evaluate(() =>
            ['filtro-tipo', 'filtro-desde', 'filtro-hasta', 'filtro-usuario'].map((id) => {
              const el = document.getElementById(id)!;
              return { alto: Math.round(el.getBoundingClientRect().height), radio: getComputedStyle(el).borderRadius, y: Math.round(el.getBoundingClientRect().y) };
            }),
          );
          expect(new Set(medidas.map((m) => m.alto)).size).toBe(1);
          expect(new Set(medidas.map((m) => m.radio)).size).toBe(1);
          // Apilados en móvil, en una sola fila en escritorio.
          expect(new Set(medidas.map((m) => m.y)).size).toBe(ancho < 640 ? 4 : ancho >= 1280 ? 1 : 2);
          await expect(filtros.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();

          const detalle = page.getByRole('button', { name: /^Ver detalle:/ }).first();
          test.skip((await detalle.count()) === 0, 'la base no tiene eventos de seguridad');
          await detalle.click();
          const dialogo = page.getByRole('dialog');
          await expect(dialogo).toBeVisible();
          const caja = (await dialogo.boundingBox())!;
          expect(caja.x).toBeGreaterThanOrEqual(0);
          expect(caja.x + caja.width).toBeLessThanOrEqual(ancho + 1);
          expect(caja.y + caja.height).toBeLessThanOrEqual(alto + 1);
          await page.keyboard.press('Escape');
          await expect(dialogo).toHaveCount(0);
          await expect(detalle).toBeFocused();
        } finally {
          await page.context().close();
        }
      });
    });
  }
}

test.describe('acceso a la página de Tendencias', () => {
  test('un estudiante es devuelto a su dashboard, también en móvil', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/dashboard/admin/metricas?periodo=mes');
      await page.waitForURL(/\/dashboard$/);
      await expect(page.getByRole('heading', { name: 'Tendencias de uso' })).toHaveCount(0);
      await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test('con el teclado: del resumen del panel a la página y al selector de periodo', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/dashboard/admin');
      const enlace = page.locator('#metricas').getByRole('link', { name: 'Ver tendencias de uso' });
      await enlace.focus();
      await expect(enlace).toBeFocused();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/dashboard\/admin\/metricas$/);

      const mes = page.getByRole('group', { name: 'Periodo de las tendencias' }).getByRole('radio', { name: 'Mes' });
      await mes.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\?periodo=mes$/);
      await expect(mes).toHaveAttribute('aria-checked', 'true');
    } finally {
      await page.context().close();
    }
  });
});
