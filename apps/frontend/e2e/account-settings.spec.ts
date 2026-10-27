import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * Menú de cuenta único (Mi perfil, Configuración, Cerrar sesión), vista
 * Configuración y separación con el perfil y la bandeja de notificaciones.
 * Solo lectura: no cambia ninguna preferencia (eso lo cubre
 * profile-notification-preferences.spec.ts).
 */

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';
/** Carpeta externa al repositorio para capturas de evidencia; sin ella no se guarda ninguna. */
const EVIDENCIAS = process.env.E2E_EVIDENCE_DIR;

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return page;
}

async function captura(page: Page, nombre: string) {
  if (EVIDENCIAS) await page.screenshot({ path: path.join(EVIDENCIAS, `${nombre}.png`) });
}

const cuentas = (page: Page) => page.locator('button[aria-haspopup="menu"]:visible').filter({ has: page.locator('.rounded-pill, .rounded-full, img') });

async function sinDesborde(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test.describe('Cuenta: menú único, Configuración y perfil', () => {
  test('estudiante en escritorio: la barra superior no tiene menú de cuenta y el de la barra lateral lleva a las tres acciones', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');
      await expect(page.locator('main h1').first()).toBeVisible();

      const cabecera = page.locator('main > header');
      await expect(cabecera.getByRole('button', { name: /^Notificaciones/ })).toBeVisible();
      await expect(cabecera.getByRole('button', { name: 'Cambiar tema' })).toBeVisible();
      await expect(cabecera.locator('button[aria-haspopup="menu"]')).toHaveCount(0);
      await expect(cuentas(page)).toHaveCount(1);

      const disparador = page.locator('#dashboard-account-menu button');
      await expect(disparador).toContainText('@uvg.edu.gt');
      await disparador.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toHaveAttribute('data-side', 'top');
      await expect(menu.getByRole('menuitem')).toHaveText(['Mi perfil', 'Configuración', 'Cerrar sesión']);
      // Se superpone: abrirlo no mueve el bloque de la cuenta.
      const cajaMenu = await menu.boundingBox();
      const cajaDisparador = await disparador.boundingBox();
      expect(cajaMenu!.y + cajaMenu!.height).toBeLessThanOrEqual(cajaDisparador!.y + 1);
      await captura(page, 'menu-cuenta-estudiante-1440');

      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(disparador).toBeFocused();

      // Clic fuera también lo cierra.
      await disparador.click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.mouse.click(900, 400);
      await expect(page.getByRole('menu')).toBeHidden();

      await disparador.click();
      await page.getByRole('menuitem', { name: 'Configuración' }).click();
      await expect(page).toHaveURL(/\/dashboard\/configuracion$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();

      await page.locator('#dashboard-account-menu button').click();
      await expect(page.getByRole('menuitem', { name: 'Configuración' })).toHaveAttribute('aria-current', 'page');
      await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
      await expect(page).toHaveURL(/\/dashboard\/perfil$/);
    } finally {
      await page.context().close();
    }
  });

  test('Configuración: siete familias cerradas con contador, se abren sin guardar nada', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      const escrituras: string[] = [];
      page.on('request', (r) => {
        if (r.method() !== 'GET' && r.url().includes('/notificaciones/preferencias')) escrituras.push(r.method());
      });
      await page.goto('/dashboard/configuracion');
      await expect(page.getByText('Administra qué notificaciones deseas recibir en UVGenius.')).toBeVisible();
      const seccion = page.getByRole('region', { name: 'Preferencias de notificaciones', exact: true });
      await expect(seccion.getByText('Los cambios se guardan automáticamente.')).toBeVisible();

      const familias = seccion.locator('[data-slot="accordion-trigger"]');
      await expect(familias).toHaveCount(7);
      await expect(seccion.locator('h3 [id^="preferencias-grupo-"]')).toHaveText([
        'Tareas e hitos',
        'Postulaciones y equipo',
        'Proyectos',
        'Horas y reconocimiento',
        'Recordatorios y calendario',
        'Red de contactos',
        'Cuenta y seguridad',
      ]);
      await expect(seccion.getByRole('switch')).toHaveCount(0);
      for (const texto of await familias.allInnerTexts()) expect(texto).toMatch(/\d+ de \d+ activas/);
      await captura(page, 'configuracion-cerrada-1440');

      // Teclado: Enter abre la familia enfocada; varias quedan abiertas a la vez.
      await familias.nth(5).focus();
      await page.keyboard.press('Enter');
      await expect(familias.nth(5)).toHaveAttribute('aria-expanded', 'true');
      await familias.nth(3).click();
      // Se abren «Red de contactos» y «Horas y reconocimiento»: aparecen los interruptores que dicen sus
      // contadores, sin fijar una cifra que cambia cada vez que el backend suma un tipo (T-347 añadió la insignia).
      const tiposDe = async (n: number) => Number((await familias.nth(n).innerText()).match(/\d+ de (\d+) activas/)?.[1]);
      await expect(seccion.getByRole('switch')).toHaveCount((await tiposDe(5)) + (await tiposDe(3)));
      await captura(page, 'configuracion-abierta-1440');
      await page.keyboard.press('Space');
      expect(escrituras).toEqual([]);

      // El total de interruptores coincide con lo que entrega el backend.
      const total = ((await (await page.request.get('/api/notificaciones/preferencias')).json()) as unknown[]).length;
      const cerradas = seccion.locator('[data-slot="accordion-trigger"][aria-expanded="false"]');
      while ((await cerradas.count()) > 0) await cerradas.first().click();
      await expect(seccion.getByRole('switch')).toHaveCount(total);
      expect(escrituras).toEqual([]);
    } finally {
      await page.context().close();
    }
  });

  test('Configuración: «Recordatorios y calendario» incluye las tres reuniones de Administración (HU-195)', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.goto('/dashboard/configuracion');
      const seccion = page.getByRole('region', { name: 'Preferencias de notificaciones', exact: true });
      const familia = seccion.locator('[data-slot="accordion-trigger"]', { hasText: 'Recordatorios y calendario' });
      const abrir = async () => {
        if ((await familia.getAttribute('aria-expanded')) !== 'true') await familia.click();
        await expect(familia).toHaveAttribute('aria-expanded', 'true');
      };
      await abrir();
      for (const etiqueta of ['Reunión programada', 'Reunión actualizada', 'Reunión cancelada']) {
        await expect(seccion.getByRole('switch', { name: etiqueta, exact: true })).toBeVisible();
      }

      // Se cambia, se guarda en el servidor y sobrevive a la recarga; al final queda como estaba.
      const cancelada = seccion.getByRole('switch', { name: 'Reunión cancelada', exact: true });
      const inicial = (await cancelada.getAttribute('aria-checked')) ?? 'true';
      const cambiado = inicial === 'true' ? 'false' : 'true';
      const conmutar = async () => {
        const guardado = page.waitForResponse((r) => r.url().includes('/notificaciones/preferencias') && r.request().method() !== 'GET');
        await cancelada.click();
        expect((await guardado).ok()).toBe(true);
      };
      await conmutar();
      await expect(cancelada).toHaveAttribute('aria-checked', cambiado);
      await page.reload();
      await abrir();
      await expect(cancelada).toHaveAttribute('aria-checked', cambiado);
      await conmutar();
      await expect(cancelada).toHaveAttribute('aria-checked', inicial);
    } finally {
      await page.context().close();
    }
  });

  test('el perfil ya no muestra las preferencias y conserva sus secciones', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      const pedidas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/notificaciones/preferencias')) pedidas.push(r.url());
      });
      await page.goto('/dashboard/perfil');
      await expect(page.getByText('Editar perfil').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Preferencias de notificaciones' })).toHaveCount(0);
      await expect(page.getByRole('switch')).toHaveCount(0);
      expect(pedidas).toEqual([]);
      await captura(page, 'perfil-sin-preferencias-1440');
    } finally {
      await page.context().close();
    }
  });

  test('la campana y la bandeja siguen funcionando, separadas de Configuración', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard/configuracion');
      await page.locator('main > header').getByRole('button', { name: /^Notificaciones/ }).click();
      const panel = page.getByLabel('Panel de notificaciones');
      await expect(panel).toBeVisible();
      await panel.getByRole('link', { name: 'Ver todas' }).click();
      await expect(page).toHaveURL(/\/dashboard\/notificaciones$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();
      await expect(page.getByRole('switch')).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test('tableta y móvil: un solo menú de cuenta visible, sin desborde', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      for (const [ancho, alto] of [
        [768, 1024],
        [375, 800],
      ]) {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.goto('/dashboard/configuracion');
        await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();
        await expect(page.locator('[data-slot="accordion-trigger"]')).toHaveCount(7);
        await expect(cuentas(page)).toHaveCount(1);
        await sinDesborde(page);

        await page.locator('[data-slot="accordion-trigger"]').nth(2).click();
        await expect(page.getByRole('switch').first()).toBeVisible();
        await sinDesborde(page);
        await captura(page, `configuracion-${ancho}`);

        await cuentas(page).click();
        await expect(page.getByRole('menuitem')).toHaveText(['Mi perfil', 'Configuración', 'Cerrar sesión']);
        await captura(page, `menu-cuenta-${ancho}`);
        await page.keyboard.press('Escape');
      }
    } finally {
      await page.context().close();
    }
  });

  test('administrador: mismo menú y Configuración con su armazón y sus tipos', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard/admin');
      const disparador = page.locator('[data-slot="admin-sidebar-footer"] button').first();
      await disparador.click();
      await expect(page.getByRole('menuitem')).toHaveText(['Mi perfil', 'Configuración', 'Cerrar sesión']);
      await captura(page, 'menu-cuenta-admin-1440');
      await page.getByRole('menuitem', { name: 'Configuración' }).click();
      await expect(page).toHaveURL(/\/dashboard\/configuracion$/);
      // Sigue en el armazón de administración: no lo redirige a su panel ni al del estudiante.
      await expect(page.locator('.admin-sidebar')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();
      await expect(page.locator('[data-slot="accordion-trigger"]')).toHaveCount(7);
      await sinDesborde(page);
      await captura(page, 'configuracion-admin-1440');
    } finally {
      await page.context().close();
    }
  });

  test('tema oscuro: Configuración y el menú se leen', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => localStorage.setItem('theme', 'dark'));
      await page.goto('/dashboard/configuracion');
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
      await page.locator('[data-slot="accordion-trigger"]').first().click();
      await expect(page.getByRole('switch').first()).toBeVisible();
      await captura(page, 'configuracion-oscuro-1440');
      await page.locator('#dashboard-account-menu button').click();
      await expect(page.getByRole('menuitem', { name: 'Configuración' })).toHaveAttribute('aria-current', 'page');
      await captura(page, 'menu-cuenta-oscuro-1440');
    } finally {
      await page.evaluate(() => localStorage.setItem('theme', 'light')).catch(() => undefined);
      await page.context().close();
    }
  });

  test('sin sesión, Configuración manda al login', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    try {
      await page.goto('/dashboard/configuracion');
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await page.context().close();
    }
  });
});
