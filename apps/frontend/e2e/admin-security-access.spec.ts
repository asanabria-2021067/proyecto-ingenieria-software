import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login, loginFallido } from './support/auth';
import { medirContraste } from './support/accesibilidad';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * FG02-C08 (T-310): el visor administrativo de eventos de seguridad en un
 * navegador real, contra la pila aislada (scripts/e2e/isolated-stack.sh).
 *
 * No siembra nada: los eventos que lee son los que la propia aplicación
 * registra al iniciar sesión las cuentas de la suite y al fallar un inicio de
 * sesión contra una cuenta que no existe. Solo lectura sobre la bitácora.
 *
 *  - Acceso: el administrador llega desde el menú; un estudiante no entra a la
 *    vista y la API le responde 403; sin sesión, 401.
 *  - Presentación: 375, 768 y 1440 px, en claro y en oscuro: sin desborde
 *    horizontal, sin controles fuera de la ventana, etiquetas sin recortar y
 *    texto con contraste AA.
 *  - Teclado: foco visible, el detalle se abre con Enter, se cierra con Escape
 *    y devuelve el foco.
 */

const ADMIN = 'admin@uvg.edu.gt';
const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const RUTA = '/dashboard/admin/seguridad';
const ENDPOINT = `${API_URL}/api/admin/eventos-seguridad`;
const ANCHOS = [375, 768, 1440];
/** Carpeta externa al repositorio para capturas de evidencia; sin ella no se guarda ninguna. */
const EVIDENCIAS = process.env.E2E_EVIDENCE_DIR;

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return page;
}

async function abrirVisor(page: Page) {
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Eventos de seguridad/ })).toBeVisible();
}

async function fijarTema(page: Page, oscuro: boolean) {
  if ((await page.evaluate(() => document.documentElement.classList.contains('dark'))) === oscuro) return;
  await page.getByRole('button', { name: 'Cambiar tema' }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
}

const medir = (page: Page) =>
  page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const visibles = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    const nombre = (el: HTMLElement) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 50);
    return {
      desborde: document.documentElement.scrollWidth - ancho,
      // El cuerpo del visor no se desplaza en horizontal dentro de su propio contenedor.
      desbordeInterno: visibles('main [class*="overflow-auto"]').map((el) => el.scrollWidth - el.clientWidth),
      fuera: visibles('main h1, main form[role="search"] *, main table button, main nav button, header button')
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > ancho + 1 || r.left < -1;
        })
        .map(nombre),
      recortadas: visibles('main [data-slot="tag"]')
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map(nombre),
      etiquetas: visibles('main [data-slot="tag"]').length,
      botonesDetalle: visibles('main table button').length,
    };
  });

test.describe('FG02-C08: acceso al visor de eventos de seguridad', () => {
  test('sin sesión la API responde 401 y la vista manda al login', async ({ browser }) => {
    const contexto = await browser.newContext();
    expect((await contexto.request.get(ENDPOINT)).status()).toBe(401);

    const page = await contexto.newPage();
    await page.goto(RUTA);
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Eventos de seguridad' })).toHaveCount(0);
    await contexto.close();
  });

  test('un estudiante recibe 403 de la API y no entra a la vista', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    const respuesta = await page.context().request.get(ENDPOINT);
    expect(respuesta.status()).toBe(403);
    expect(await respuesta.json()).not.toHaveProperty('data');

    await page.goto(RUTA);
    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Eventos de seguridad' })).toHaveCount(0);
    await page.context().close();
  });

  test('el administrador llega desde el menú y lee eventos reales, saneados', async ({ browser }) => {
    // Margen para esperar la ventana del límite de inicios de sesión si otros specs la agotaron.
    test.setTimeout(240_000);
    // Un inicio de sesión fallido contra una cuenta inexistente: lo registra la propia aplicación.
    // El correo es único por ejecución: repetir el mismo acumularía intentos hasta el bloqueo
    // temporal y el motivo registrado dejaría de ser «credenciales».
    const anonimo = await browser.newContext();
    expect(await loginFallido(anonimo.request, API_URL, `no-existe-fg02-${Date.now()}@uvg.edu.gt`)).toBe(401);
    await anonimo.close();

    const page = await sesion(browser, ADMIN);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/admin');
    const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
    const enlace = nav.getByRole('link', { name: 'Eventos de seguridad' });
    if (!(await enlace.isVisible())) await nav.getByRole('button', { name: /Verificación y seguridad/ }).click();

    const consulta = page.waitForResponse((r) => r.url().startsWith(ENDPOINT) && r.request().method() === 'GET');
    await enlace.click();
    await page.waitForURL(new RegExp(`${RUTA}$`));
    const respuesta = await consulta;
    expect(respuesta.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos de seguridad' })).toHaveAttribute('aria-current', 'page');
    const miga = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(miga.getByText('Verificación y seguridad')).toBeVisible();
    await expect(miga.getByText('Eventos de seguridad')).toHaveAttribute('aria-current', 'page');

    // Contrato real: solo las claves saneadas, sin JSON crudo ni correos.
    const cuerpo = await respuesta.json();
    expect(Object.keys(cuerpo).sort()).toEqual(['data', 'page', 'tipos', 'total', 'totalPages']);
    expect(cuerpo.total).toBeGreaterThanOrEqual(2);
    for (const evento of cuerpo.data) {
      expect(Object.keys(evento).sort()).toEqual(['actor', 'cuenta', 'detalle', 'fecha', 'id', 'origen', 'tipo']);
    }
    expect(JSON.stringify(cuerpo)).not.toMatch(/@uvg\.edu\.gt|detalleJson|Incorrecta-123|no-existe-fg02/);

    const tabla = page.getByRole('table', { name: /Eventos de seguridad/ });
    await expect(tabla.getByRole('columnheader')).toHaveText(['Fecha', 'Tipo', 'Actor', 'Cuenta', 'Origen', 'Detalle']);
    // Cada dato existe dos veces en el DOM (columna y versión compacta): se afirma sobre la que se ve.
    const visible = (texto: string | RegExp) => tabla.getByText(texto).locator('visible=true').first();
    await expect(visible('Inicio de sesión fallido')).toBeVisible();
    await expect(visible('Credenciales incorrectas · Cuenta inexistente')).toBeVisible();
    // D-FG02-02: en esta pila el backend no confía en ningún proxy.
    await expect(visible('IP no verificada')).toBeVisible();
    await expect(tabla.getByText('IP verificada', { exact: true })).toHaveCount(0);
    // A 1440 px caben las seis columnas.
    await expect(tabla.getByRole('columnheader').locator('visible=true')).toHaveCount(6);

    const texto = (await page.locator('main').innerText()) ?? '';
    expect(texto).not.toMatch(/@uvg\.edu\.gt|no-existe-fg02|\{"|null|undefined/);
    await page.context().close();
  });
});

test.describe('FG02-C08: presentación del visor por ancho y tema', () => {
  test('375, 768 y 1440 px en claro y oscuro: sin desborde, sin recortes y con contraste AA', async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await sesion(browser, ADMIN);
    const hallazgos: string[] = [];
    let combinaciones = 0;

    for (const oscuro of [false, true]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await abrirVisor(page);
      await fijarTema(page, oscuro);
      for (const ancho of ANCHOS) {
        const etiqueta = `${ancho}px ${oscuro ? 'oscuro' : 'claro'}`;
        await page.setViewportSize({ width: ancho, height: ancho < 768 ? 800 : 900 });
        await abrirVisor(page);
        const medida = await medir(page);
        combinaciones += 1;

        if (medida.desborde > 1) hallazgos.push(`${etiqueta}: desborde horizontal de ${medida.desborde}px`);
        if (medida.desbordeInterno.some((px) => px > 1)) hallazgos.push(`${etiqueta}: el cuerpo de la vista se desplaza en horizontal`);
        if (medida.fuera.length) hallazgos.push(`${etiqueta}: fuera de la ventana: ${medida.fuera.join(' | ')}`);
        if (medida.recortadas.length) hallazgos.push(`${etiqueta}: etiquetas recortadas: ${medida.recortadas.join(' | ')}`);
        if (medida.etiquetas === 0) hallazgos.push(`${etiqueta}: no se ve ninguna etiqueta de tipo`);
        if (medida.botonesDetalle === 0) hallazgos.push(`${etiqueta}: no se ve ningún «Ver detalle»`);

        const contrastes = await medirContraste(
          page,
          'main h1, main h1 + p, main form label, main form p, main [role="status"], main table th, main table td time, main table td p, main table td span, main [data-slot="tag"]',
        );
        expect(contrastes.length, `${etiqueta}: se midió texto`).toBeGreaterThan(8);
        for (const c of contrastes.filter((c) => c.ratio < 4.5)) {
          hallazgos.push(`${etiqueta}: contraste ${c.ratio}:1 en «${c.texto}» (${c.color} sobre ${c.fondo})`);
        }

        if (EVIDENCIAS) {
          fs.mkdirSync(EVIDENCIAS, { recursive: true });
          await page.screenshot({ path: path.join(EVIDENCIAS, `visor-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png`), fullPage: true });
        }
      }
    }

    expect(combinaciones).toBe(ANCHOS.length * 2);
    expect([...new Set(hallazgos)], 'hallazgos de presentación').toEqual([]);
    await fijarTema(page, false);
    await page.context().close();
  });

  test('en 375 px el detalle cabe en la ventana, en ambos temas', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    for (const oscuro of [false, true]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await abrirVisor(page);
      await fijarTema(page, oscuro);
      await page.setViewportSize({ width: 375, height: 800 });
      await abrirVisor(page);

      await page.getByRole('button', { name: /^Ver detalle:/ }).first().click();
      const dialogo = page.getByRole('dialog', { name: 'Detalle del evento de seguridad' });
      await expect(dialogo).toBeVisible();
      const caja = await dialogo.boundingBox();
      expect(caja, 'el diálogo tiene caja').not.toBeNull();
      expect(caja!.x).toBeGreaterThanOrEqual(0);
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(375 + 1);
      expect(caja!.height).toBeLessThanOrEqual(800);
      // La X está siempre a la vista; el pie se alcanza desplazando el propio diálogo, nunca la página.
      await expect(dialogo.getByRole('button', { name: 'Cerrar detalle' })).toBeInViewport();
      const pie = dialogo.getByRole('button', { name: 'Cerrar', exact: true });
      await pie.scrollIntoViewIfNeeded();
      await expect(pie).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      const contrastes = await medirContraste(page, '[role="dialog"] h2, [role="dialog"] p, [role="dialog"] dt, [role="dialog"] dd');
      expect(contrastes.filter((c) => c.ratio < 4.5), `detalle ${oscuro ? 'oscuro' : 'claro'}`).toEqual([]);
      if (EVIDENCIAS) {
        fs.mkdirSync(EVIDENCIAS, { recursive: true });
        await page.screenshot({ path: path.join(EVIDENCIAS, `detalle-375-${oscuro ? 'oscuro' : 'claro'}.png`) });
      }
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
    }
    await fijarTema(page, false);
    await page.context().close();
  });
});

test.describe('FG02-C08: teclado en el visor', () => {
  test('foco visible; Enter abre el detalle, Escape lo cierra y el foco vuelve al botón', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    await page.setViewportSize({ width: 1440, height: 900 });
    await abrirVisor(page);

    // Se llega al botón con el teclado, para que el navegador aplique :focus-visible.
    const boton = page.getByRole('button', { name: /^Ver detalle:/ }).first();
    await page.getByLabel('ID de usuario').focus();
    for (let i = 0; i < 12 && !(await boton.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(boton).toBeFocused();
    const foco = await boton.evaluate((el) => {
      const estilo = getComputedStyle(el);
      return { anillo: estilo.boxShadow !== 'none', contorno: estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0 };
    });
    expect(foco.anillo || foco.contorno, 'el botón enfocado muestra un indicador de foco').toBe(true);

    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Detalle del evento de seguridad' });
    await expect(dialogo).toBeVisible();
    expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await expect(dialogo.getByRole('term')).toContainText(['Tipo', 'Fecha y hora', 'Evento n.º', 'Actor', 'Cuenta afectada', 'Origen']);
    expect(await dialogo.innerText()).not.toMatch(/@uvg\.edu\.gt|\{"|null|undefined/);

    // El foco no sale del diálogo mientras está abierto.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(boton).toBeFocused();
    await page.context().close();
  });

  test('los filtros se manejan con el teclado y la API recibe el filtro elegido', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    await page.setViewportSize({ width: 1440, height: 900 });
    await abrirVisor(page);

    const filtrada = page.waitForResponse((r) => r.url().startsWith(ENDPOINT) && r.url().includes('tipo=LOGIN_FAILED'));
    await page.getByRole('combobox', { name: 'Tipo de evento' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Inicio de sesión fallido' }).focus();
    await page.keyboard.press('Enter');
    expect((await filtrada).status()).toBe(200);

    const tabla = page.getByRole('table', { name: /Eventos de seguridad/ });
    await expect(tabla.locator('[data-slot="tag"]').first()).toHaveText('Inicio de sesión fallido');
    await expect(tabla.locator('[data-slot="tag"]').filter({ hasNotText: 'Inicio de sesión fallido' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Limpiar' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Tipo de evento' })).toHaveText('Todos los tipos');
    await page.context().close();
  });
});
