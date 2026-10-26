import { test, expect } from './support/test';
import { login } from './support/auth';
import { analizarAccesibilidad, describirViolaciones } from './support/a11y';
import { overflowHorizontal } from './support/calendario';
import { desactivarTour } from './support/realtime';

/**
 * Sprint 10: Personas como módulo social (grupo «Personas» de la sidebar
 * global, filtros en línea) contra el backend real y el seed. Solo lectura:
 * no crea amistades.
 */
const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const BUSCAR = /\/api\/social\/usuarios\/buscar\?/;

test.describe('Personas: grupo de la sidebar global y filtros con datos reales (Sprint 10)', () => {
  test.beforeEach(async ({ page }) => {
    await desactivarTour(page);
    await login(page, ESTUDIANTE);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('las secciones viven en la URL, cambian encabezado y consulta, y soportan atrás/adelante', async ({ page }) => {
    await page.goto('/dashboard/personas');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(page.getByRole('heading', { level: 1, name: 'Descubrir personas' })).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByRole('link', { name: 'Descubrir personas' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tab')).toHaveCount(0);
    // Una única sidebar: sin la columna secundaria del rediseño anterior.
    await expect(page.getByRole('navigation', { name: 'Navegación de Personas' })).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(1);

    // El grupo se pliega y despliega como Proyectos y Mi trabajo, sin cerrar los demás.
    const grupo = nav.getByRole('button', { name: /^Personas/ });
    await expect(grupo).toHaveAttribute('aria-expanded', 'true');
    await grupo.click();
    await expect(grupo).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('link', { name: 'Mis amigos' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Mis Proyectos' })).toBeVisible();
    await grupo.click();
    await expect(grupo).toHaveAttribute('aria-expanded', 'true');

    const amigos = page.waitForRequest((r) => BUSCAR.test(r.url()) && r.url().includes('soloAmigos=true'));
    await nav.getByRole('link', { name: 'Mis amigos' }).click();
    await amigos;
    await expect(page).toHaveURL(/\/dashboard\/personas\?seccion=amigos$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis amigos' })).toBeVisible();
    await expect(page.getByText('Personas que quizás conozcas')).toHaveCount(0);
    // Con amistad confirmada nunca se ofrece volver a agregar.
    const directorio = page.getByRole('region', { name: 'Directorio de personas' });
    await expect(directorio.getByRole('button', { name: 'Agregar como amigo' })).toHaveCount(0);

    const ada = page.waitForRequest((r) => BUSCAR.test(r.url()) && r.url().includes('amigosDeAmigos=true'));
    await nav.getByRole('link', { name: 'Amigos de amigos' }).click();
    await ada;
    await expect(page.getByRole('heading', { level: 1, name: 'Amigos de amigos' })).toBeVisible();

    await expect(nav.getByRole('link', { name: 'Amigos de amigos' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Descubrir personas' })).not.toHaveAttribute('aria-current');

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Mis amigos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Mis amigos' })).toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Amigos de amigos' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Amigos de amigos' })).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByRole('link', { name: 'Amigos de amigos' })).toHaveAttribute('aria-current', 'page');
  });

  test('semestre, habilidades reales y mi carrera se envían juntos al backend y se quitan desde sus chips', async ({ page }) => {
    await page.goto('/dashboard/personas');
    await expect(page.getByRole('heading', { level: 1, name: 'Descubrir personas' })).toBeVisible({ timeout: 15_000 });

    const conSemestre = page.waitForRequest((r) => BUSCAR.test(r.url()) && r.url().includes('semestreRango=5-7'));
    await page.getByRole('combobox', { name: 'Filtrar por semestre' }).click();
    await page.getByRole('option', { name: '5.º–7.º' }).click();
    await conSemestre;

    // Habilidades del catálogo real: se marcan dos sin que el menú se cierre.
    await page.getByRole('button', { name: 'Filtrar por habilidades' }).click();
    const opciones = page.getByRole('menuitemcheckbox');
    await expect(opciones.first()).toBeVisible();
    const [primera, segunda] = [await opciones.nth(0).textContent(), await opciones.nth(1).textContent()];
    const conDos = page.waitForRequest((r) => BUSCAR.test(r.url()) && /habilidades=\d+%2C\d+|habilidades=\d+,\d+/.test(r.url()));
    await opciones.nth(0).click();
    await opciones.nth(1).click();
    await conDos;
    await expect(page.getByRole('menuitemcheckbox', { name: primera ?? '' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Filtrar por habilidades, 2 seleccionadas' })).toBeVisible();

    const carrera = page.getByRole('checkbox', { name: 'Solo personas de mi carrera' });
    if (await carrera.isEnabled()) {
      const conCarrera = page.waitForRequest((r) => BUSCAR.test(r.url()) && r.url().includes('carrera=true') && r.url().includes('semestreRango=5-7'));
      await carrera.click();
      await conCarrera;
    }

    const aplicados = page.getByRole('group', { name: 'Filtros aplicados' });
    await aplicados.getByRole('button', { name: `Quitar filtro ${segunda}` }).click();
    await expect(aplicados.getByRole('button', { name: `Quitar filtro ${segunda}` })).toHaveCount(0);

    // Cambiar a lista no reinicia los filtros.
    await page.getByRole('button', { name: 'Ver como lista' }).click();
    await expect(page.getByRole('combobox', { name: 'Filtrar por semestre' })).toContainText('5.º–7.º');

    // Sin filtros vuelve la consulta inicial (puede salir de la caché, sin petición nueva).
    await aplicados.getByRole('button', { name: 'Limpiar todo' }).click();
    await expect(aplicados).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Filtrar por semestre' })).toContainText('Todos los semestres');
    await expect(page.getByRole('button', { name: 'Filtrar por habilidades' })).toBeVisible();
  });

  test('el contenido recupera el ancho: tres columnas de tarjetas con la sidebar global abierta en 1440 px', async ({ page }) => {
    await page.goto('/dashboard/personas');
    const directorio = page.getByRole('region', { name: 'Directorio de personas' });
    const tarjetas = directorio.locator('ul > li');
    await expect(tarjetas.nth(2)).toBeVisible({ timeout: 15_000 });
    const [a, b, c] = await Promise.all([0, 1, 2].map((i) => tarjetas.nth(i).boundingBox()));
    expect(a?.y).toBe(b?.y);
    expect(b?.y).toBe(c?.y);
    expect(await overflowHorizontal(page)).toBeLessThanOrEqual(0);
  });

  test('en móvil la navegación pasa a «Secciones» y la página no desborda', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/dashboard/personas');
    await expect(page.getByRole('heading', { level: 1, name: 'Descubrir personas' })).toBeVisible({ timeout: 15_000 });
    expect(await overflowHorizontal(page)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Secciones' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Mis amigos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mis amigos' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await overflowHorizontal(page)).toBeLessThanOrEqual(0);
  });

  test('axe: las tres secciones sin violaciones graves ni críticas de WCAG A/AA, en claro y oscuro', async ({ page }, testInfo) => {
    for (const oscuro of [false, true]) {
      for (const seccion of ['', '?seccion=amigos', '?seccion=amigos-de-amigos']) {
        await page.evaluate((t) => localStorage.setItem('theme', t), oscuro ? 'dark' : 'light');
        await page.goto(`/dashboard/personas${seccion}`);
        await expect(page.getByRole('region', { name: 'Directorio de personas' })).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState('networkidle');
        await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
        const nombre = `personas-${seccion.replace('?seccion=', '') || 'descubrir'}-${oscuro ? 'oscuro' : 'claro'}`;
        const { violaciones, bloqueantes } = await analizarAccesibilidad(page, testInfo, nombre);
        testInfo.annotations.push({ type: 'a11y', description: `${nombre}: ${violaciones.length} violación(es), ${bloqueantes.length} bloqueante(s)` });
        expect(describirViolaciones(bloqueantes), nombre).toEqual([]);
      }
    }
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
  });
});
