import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * FG08-C03 (T-321): los destinos nuevos dentro del menú administrativo
 * agrupado, en un navegador real contra la pila aislada.
 *
 *  - Métricas (HU-178): «Métricas → Tendencias de uso» lleva a la sección real
 *    del Panel Admin; su API responde 200 al administrador, 403 a un
 *    estudiante y 401 sin sesión.
 *  - Eventos de seguridad (T-310): «Verificación y seguridad → Eventos de
 *    seguridad», con miga de pan y destino activo.
 *  - Cuentas pendientes (HU-179, PR #270): «Verificación y seguridad →
 *    Cuentas pendientes», con miga de pan y destino activo.
 *  - Navegación: cada destino del menú abre una vista real; recarga y
 *    atrás/adelante conservan la ruta; un estudiante no entra a ninguna.
 *
 * Solo lectura: no crea ni modifica datos.
 */

const ADMIN = 'admin@uvg.edu.gt';
const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const API = `${API_URL}/api`;

/** El menú esperado: grupo → [etiqueta, ruta, titular de la vista]. */
const MENU: [string, [string, string, RegExp][]][] = [
  [
    'Usuarios',
    [
      ['Gestión de Usuarios', '/dashboard/admin/usuarios', /Gestión de Usuarios/],
      ['Recuperación de contraseña', '/dashboard/admin/solicitudes-recuperacion', /Recuperación de contraseña/],
    ],
  ],
  [
    'Proyectos',
    [
      ['Activos', '/dashboard/admin/proyectos?grupo=activos', /^Activos$/],
      ['Solicitudes de publicación', '/dashboard/projects/admin/reviews', /Solicitudes de publicación/],
      ['Solicitudes de cierre', '/dashboard/admin/proyectos?grupo=cierres', /Solicitudes de cierre/],
      ['Cerrados', '/dashboard/admin/proyectos?grupo=cerrados', /^Cerrados$/],
      ['Calendario de Sprints', '/dashboard/admin/sprints', /Calendario de Sprints/],
    ],
  ],
  ['Gobernanza', [['Apelaciones', '/dashboard/admin/apelaciones', /Apelaciones de liderazgo/]]],
  ['Métricas', [['Tendencias de uso', '/dashboard/admin#metricas', /Panel de Administración/]]],
  [
    'Verificación y seguridad',
    [
      ['Cuentas pendientes', '/dashboard/admin/cuentas-pendientes', /Cuentas pendientes/],
      ['Eventos de seguridad', '/dashboard/admin/seguridad', /Eventos de seguridad/],
    ],
  ],
  ['Diagnóstico', [['Etiquetas (temporal)', '/dashboard/admin/etiquetas', /Etiquetas/]]],
];

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return page;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

/** Abre el grupo si está plegado y devuelve el enlace del destino. */
async function destino(page: Page, grupo: string, etiqueta: string) {
  const enlace = nav(page).getByRole('link', { name: etiqueta, exact: true });
  if (!(await enlace.isVisible())) await nav(page).getByRole('button', { name: new RegExp(`^${grupo}`) }).click();
  await expect(enlace).toBeVisible();
  return enlace;
}

test.describe('FG08-C03: destinos nuevos en el menú administrativo', () => {
  test('Métricas (HU-178): el menú lleva a «Tendencias de uso» y su API respeta los permisos', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin/usuarios');

    const enlace = await destino(admin, 'Métricas', 'Tendencias de uso');
    await expect(enlace).toHaveAttribute('href', '/dashboard/admin#metricas');
    const metricas = admin.waitForResponse((r) => r.url().startsWith(`${API}/admin/metricas`) && r.request().method() === 'GET');
    await enlace.click();
    await admin.waitForURL(/\/dashboard\/admin#metricas$/);
    expect((await metricas).status()).toBe(200);

    const seccion = admin.locator('#metricas');
    await expect(seccion.getByRole('heading', { name: 'Tendencias de uso' })).toBeInViewport();
    await expect(admin.getByRole('heading', { level: 1, name: 'Panel de Administración' })).toHaveCount(1);
    // Es una sección del panel: el destino actual del menú sigue siendo «Panel Admin».
    await expect(nav(admin).getByRole('link', { name: 'Panel Admin', exact: true })).toHaveAttribute('aria-current', 'page');
    // La sección de HU-178 existe una sola vez.
    await expect(admin.getByRole('heading', { name: 'Tendencias de uso' })).toHaveCount(1);

    // Ya en el panel, y de vuelta arriba, el mismo enlace vuelve a llevar a la sección.
    await admin.locator('main h1').scrollIntoViewIfNeeded();
    await expect(seccion.getByRole('heading', { name: 'Tendencias de uso' })).not.toBeInViewport();
    await (await destino(admin, 'Métricas', 'Tendencias de uso')).click();
    await expect(seccion.getByRole('heading', { name: 'Tendencias de uso' })).toBeInViewport();

    // Y abriendo la URL directamente (recarga o enlace compartido).
    await admin.goto('/dashboard/admin#metricas');
    await expect(seccion.getByRole('heading', { name: 'Tendencias de uso' })).toBeInViewport();

    for (const periodo of ['semana', 'mes']) {
      expect((await admin.request.get(`${API}/admin/metricas?periodo=${periodo}`)).status(), periodo).toBe(200);
    }
    await admin.context().close();

    const estudiante = await sesion(browser, ESTUDIANTE);
    expect((await estudiante.request.get(`${API}/admin/metricas?periodo=semana`)).status()).toBe(403);
    await estudiante.context().close();

    const anonimo = await browser.newContext();
    expect((await anonimo.request.get(`${API}/admin/metricas?periodo=semana`)).status()).toBe(401);
    await anonimo.close();
  });

  test('Eventos de seguridad (T-310): un solo enlace, en su grupo, con miga de pan y destino activo', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    const enlace = await destino(admin, 'Verificación y seguridad', 'Eventos de seguridad');
    await expect(nav(admin).getByRole('link', { name: /seguridad/i })).toHaveCount(1);
    await enlace.click();
    await admin.waitForURL(/\/dashboard\/admin\/seguridad$/);

    await expect(admin.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
    const miga = admin.getByRole('navigation', { name: /breadcrumb/i });
    await expect(miga.getByRole('listitem')).toHaveText(['Verificación y seguridad', 'Eventos de seguridad']);
    await expect(miga.getByText('Eventos de seguridad')).toHaveAttribute('aria-current', 'page');
    await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText(['Eventos de seguridad']);
    await expect(nav(admin).getByRole('button', { name: /^Verificación y seguridad/ })).toHaveAttribute('aria-expanded', 'true');
    await admin.context().close();
  });

  test('Cuentas pendientes (HU-179): un solo enlace, en su grupo, con miga de pan y destino activo', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    const enlace = await destino(admin, 'Verificación y seguridad', 'Cuentas pendientes');
    await expect(nav(admin).getByRole('link', { name: /pendiente/i })).toHaveCount(1);
    await enlace.click();
    await admin.waitForURL(/\/dashboard\/admin\/cuentas-pendientes$/);

    await expect(admin.getByRole('heading', { level: 1, name: 'Cuentas pendientes' })).toBeVisible();
    const miga = admin.getByRole('navigation', { name: /breadcrumb/i });
    await expect(miga.getByRole('listitem')).toHaveText(['Verificación y seguridad', 'Cuentas pendientes']);
    await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText([/^Cuentas pendientes/]);
    await expect(nav(admin).getByRole('button', { name: /^Verificación y seguridad/ })).toHaveAttribute('aria-expanded', 'true');
    await admin.context().close();
  });

  test('una ruta administrativa inexistente responde 404', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    for (const ruta of ['/dashboard/admin/metricas', '/dashboard/admin/no-existe']) {
      expect((await admin.goto(ruta))?.status(), ruta).toBe(404);
    }
    await admin.context().close();
  });
});

test.describe('FG08-C03: navegación por el menú agrupado', () => {
  test('cada destino del menú abre su vista, con la URL y el titular correctos', async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    await expect(nav(admin).getByRole('button')).toHaveText(MENU.map(([grupo]) => new RegExp(`^${grupo}`)));

    for (const [grupo, destinos] of MENU) {
      for (const [etiqueta, ruta, titular] of destinos) {
        const enlace = await destino(admin, grupo, etiqueta);
        await expect(enlace).toHaveAttribute('href', ruta);
        await enlace.click();
        await expect(admin, etiqueta).toHaveURL(new RegExp(`${ruta.replace(/[?#]/g, '\\$&')}$`));
        await expect(admin.getByRole('heading', { level: 1 }), etiqueta).toHaveText(titular);
        await expect(admin.getByRole('navigation', { name: /breadcrumb/i }).first(), etiqueta).toBeVisible();
      }
    }
    await admin.context().close();
  });

  test('recargar y atrás/adelante conservan la ruta y el destino activo', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    await (await destino(admin, 'Usuarios', 'Gestión de Usuarios')).click();
    await admin.waitForURL(/\/dashboard\/admin\/usuarios$/);
    await (await destino(admin, 'Verificación y seguridad', 'Eventos de seguridad')).click();
    await admin.waitForURL(/\/dashboard\/admin\/seguridad$/);

    await admin.reload();
    await expect(admin).toHaveURL(/\/dashboard\/admin\/seguridad$/);
    await expect(admin.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
    await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText(['Eventos de seguridad']);

    await admin.goBack();
    await expect(admin).toHaveURL(/\/dashboard\/admin\/usuarios$/);
    await expect(admin.getByRole('heading', { level: 1, name: 'Gestión de Usuarios' })).toBeVisible();
    await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText(['Gestión de Usuarios']);

    await admin.goForward();
    await expect(admin).toHaveURL(/\/dashboard\/admin\/seguridad$/);
    await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText(['Eventos de seguridad']);
    await admin.context().close();
  });

  test('con el teclado: los grupos se abren con Enter y sus enlaces reciben el foco', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    const grupo = nav(admin).getByRole('button', { name: /^Métricas/ });
    await grupo.focus();
    await expect(grupo).toHaveAttribute('aria-expanded', 'false');
    await admin.keyboard.press('Enter');
    await expect(grupo).toHaveAttribute('aria-expanded', 'true');
    await admin.keyboard.press('Tab');
    await expect(nav(admin).getByRole('link', { name: 'Tendencias de uso' })).toBeFocused();
    await admin.keyboard.press('Enter');
    await admin.waitForURL(/#metricas$/);
    await admin.context().close();
  });

  test('con la barra plegada, los tres destinos de T-321 que existen siguen alcanzables', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.goto('/dashboard/admin');
    await admin.getByRole('button', { name: 'Colapsar barra lateral' }).click();
    await expect(admin.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
    await expect(nav(admin).getByRole('link', { name: 'Tendencias de uso' })).toHaveAttribute('href', '/dashboard/admin#metricas');
    await nav(admin).getByRole('link', { name: 'Eventos de seguridad' }).click();
    await admin.waitForURL(/\/dashboard\/admin\/seguridad$/);
    await expect(admin.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
    await admin.getByRole('button', { name: 'Expandir barra lateral' }).click();
    await admin.context().close();
  });

  test('un estudiante no entra a ningún destino administrativo', async ({ browser }) => {
    const estudiante = await sesion(browser, ESTUDIANTE);
    for (const ruta of ['/dashboard/admin', '/dashboard/admin/seguridad', '/dashboard/admin/usuarios', '/dashboard/projects/admin/reviews']) {
      await estudiante.goto(ruta);
      await estudiante.waitForURL(/\/dashboard$/);
      await expect(estudiante.getByRole('navigation', { name: 'Navegación administrativa' })).toHaveCount(0);
    }
    await estudiante.context().close();
  });

  test('sin sesión, los destinos administrativos mandan al login', async ({ browser }) => {
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    for (const ruta of ['/dashboard/admin', '/dashboard/admin/seguridad']) {
      await page.goto(ruta);
      await page.waitForURL(/\/login/);
    }
    await contexto.close();
  });
});
