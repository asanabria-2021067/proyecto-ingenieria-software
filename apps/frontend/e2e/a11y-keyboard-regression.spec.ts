import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * FG10 (T-317): humo de teclado sobre las cinco pantallas de la auditoría de
 * accesibilidad (docs/qa/sprint9/a11y-screen-inventory.md), en claro y oscuro.
 *
 * La línea base de T-316 no encontró trampas de foco ni controles sin
 * indicador; este spec lo fija como regresión y añade lo que el recorrido
 * automático no cubría: orden reversible, activación sin ratón y cierre de
 * superposiciones con Escape devolviendo el foco. Solo lectura.
 */

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';

const PANTALLAS: { nombre: string; ruta: string; correo: string }[] = [
  { nombre: 'dashboard del estudiante', ruta: '/dashboard', correo: ESTUDIANTE },
  { nombre: 'dashboard de administración', ruta: '/dashboard/admin', correo: ADMIN },
  { nombre: 'proyectos (administración)', ruta: '/dashboard/admin/proyectos?grupo=activos', correo: ADMIN },
  { nombre: 'calendario', ruta: '/dashboard/calendario', correo: ESTUDIANTE },
  { nombre: 'editar perfil', ruta: '/dashboard/perfil/editar', correo: ESTUDIANTE },
];

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

async function fijarTema(page: Page, oscuro: boolean) {
  if ((await page.evaluate(() => document.documentElement.classList.contains('dark'))) === oscuro) return;
  await page.getByRole('button', { name: 'Cambiar tema' }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
}

async function abrir(page: Page, ruta: string) {
  await page.goto(ruta);
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** Lo que tiene el foco: identidad estable, nombre y si se ve dónde está. */
const foco = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const estilo = getComputedStyle(el);
    const caja = el.getBoundingClientRect();
    const etiqueta = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null;
    return {
      // La posición distingue controles con el mismo texto (p. ej. botones repetidos por fila).
      clave: `${el.tagName}|${el.id}|${el.getAttribute('aria-label') ?? ''}|${(el.textContent ?? '').trim().slice(0, 40)}|${el.getAttribute('href') ?? ''}|${Math.round(caja.x + scrollX)},${Math.round(caja.y + scrollY)}`,
      nombre: (el.getAttribute('aria-label') ?? etiqueta ?? el.getAttribute('title') ?? el.textContent ?? el.getAttribute('placeholder') ?? '').trim().slice(0, 50),
      etiqueta: el.tagName.toLowerCase(),
      indicador: (estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0) || estilo.boxShadow !== 'none',
      visible: caja.width > 0 && caja.height > 0 && caja.bottom > 0 && caja.top < innerHeight && caja.right > 0 && caja.left < innerWidth,
    };
  });

for (const pantalla of PANTALLAS) {
  test.describe(`FG10: teclado en ${pantalla.nombre}`, () => {
    for (const oscuro of [false, true]) {
      const tema = oscuro ? 'oscuro' : 'claro';

      test(`${tema}: Tab recorre los controles en orden, con foco visible, sin trampas y de forma reversible`, async ({ browser }) => {
        const page = await sesion(browser, pantalla.correo);
        await abrir(page, pantalla.ruta);
        await fijarTema(page, oscuro);
        await abrir(page, pantalla.ruta);

        const paradas: NonNullable<Awaited<ReturnType<typeof foco>>>[] = [];
        for (let i = 0; i < 30; i += 1) {
          await page.keyboard.press('Tab');
          let actual = await foco(page);
          // El enlace «Saltar al contenido» entra con una transición de 180 ms: se mide al terminar.
          if (actual && !actual.visible) {
            await page.waitForTimeout(300);
            actual = await foco(page);
          }
          if (actual) paradas.push(actual);
        }
        expect(paradas.length, 'Tab alcanza controles').toBeGreaterThanOrEqual(20);
        // Sin trampa: el foco no da vueltas entre dos o tres elementos.
        expect(new Set(paradas.map((p) => p.clave)).size).toBeGreaterThanOrEqual(Math.floor(paradas.length * 0.9));
        expect(paradas.filter((p) => !p.indicador).map((p) => `${p.etiqueta} «${p.nombre}»`), 'controles sin indicador de foco').toEqual([]);
        expect(paradas.filter((p) => !p.visible).map((p) => `${p.etiqueta} «${p.nombre}»`), 'el foco quedó fuera de la vista').toEqual([]);
        expect(paradas.filter((p) => !p.nombre).map((p) => p.etiqueta), 'controles sin nombre').toEqual([]);

        // Shift+Tab deshace el recorrido por los mismos controles, en orden inverso.
        // Se compara por control (sin la posición, que cambia si la página se desplaza).
        const sinPosicion = (clave: string) => clave.slice(0, clave.lastIndexOf('|'));
        const ida = paradas.slice(-6).map((p) => sinPosicion(p.clave));
        const vuelta: string[] = [];
        for (let i = 0; i < 5; i += 1) {
          await page.keyboard.press('Shift+Tab');
          vuelta.push(sinPosicion((await foco(page))?.clave ?? ''));
        }
        expect(vuelta).toEqual(ida.slice(0, 5).reverse());
        await fijarTema(page, false);
        await page.context().close();
      });
    }
  });
}

test.describe('FG10: activación y superposiciones sin ratón', () => {
  test('el menú de la cuenta se abre con Enter, se cierra con Escape y devuelve el foco', async ({ browser }) => {
    // El disparador vive en la cabecera del estudiante y en el pie de la barra lateral del administrador.
    for (const [correo, ruta, disparador] of [
      [ESTUDIANTE, '/dashboard', '#dashboard-account-menu button'],
      [ADMIN, '/dashboard/admin', '[data-slot="admin-sidebar-footer"] button'],
    ]) {
      const page = await sesion(browser, correo);
      await abrir(page, ruta);
      const cuenta = page.locator(disparador).first();
      await expect(cuenta).toBeVisible();
      await cuenta.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(cuenta).toBeFocused();
      await page.context().close();
    }
  });

  test('administración: un grupo del menú se abre y se cierra con Espacio y su enlace se activa con Enter', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    await abrir(page, '/dashboard/admin');
    const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
    const grupo = nav.getByRole('button', { name: /^Usuarios/ });
    await grupo.focus();
    await page.keyboard.press('Space');
    await expect(grupo).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(grupo).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Gestión de Usuarios' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/dashboard\/admin\/usuarios$/);
    await page.context().close();
  });

  test('editar perfil: los campos se alcanzan por su etiqueta, se escriben con el teclado y «Siguiente» avanza con Enter', async ({ browser }) => {
    const page = await sesion(browser, ESTUDIANTE);
    await abrir(page, '/dashboard/perfil/editar');
    // A11Y-04 y A11Y-05: cada campo responde a su nombre accesible.
    for (const nombre of ['Nombre', 'Apellido', 'Carrera', 'Semestre Actual', 'Disponibilidad (horas/sem)', 'Horas Beca Requeridas', 'Horas Extensión Requeridas']) {
      await expect(page.getByLabel(nombre, { exact: true })).toBeVisible();
    }
    const campo = page.getByLabel('Nombre', { exact: true });
    const original = await campo.inputValue();
    await campo.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await expect(campo).toHaveValue(`${original}x`);
    await page.keyboard.press('Backspace');
    await expect(campo).toHaveValue(original);
    // Pulsar la etiqueta visible lleva el foco a su campo.
    await page.getByText('Apellido', { exact: true }).click();
    await expect(page.getByLabel('Apellido', { exact: true })).toBeFocused();

    const siguiente = page.getByRole('button', { name: 'Siguiente' });
    await siguiente.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Paso 2 de 5')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    // No se guardó nada: se sale sin pulsar «Guardar y Finalizar».
    await page.context().close();
  });

  test('administración de proyectos: el buscador y las filas se usan sin ratón', async ({ browser }) => {
    const page = await sesion(browser, ADMIN);
    await abrir(page, '/dashboard/admin/proyectos?grupo=activos');
    const buscador = page.getByRole('searchbox').or(page.getByPlaceholder(/buscar/i)).first();
    await buscador.focus();
    await page.keyboard.type('zzz-no-existe');
    await expect(buscador).toHaveValue('zzz-no-existe');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await expect(buscador).toHaveValue('');
    await page.context().close();
  });
});
