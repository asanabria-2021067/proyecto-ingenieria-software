import { test, expect } from './support/test';
import { login } from './support/auth';
import { analizarAccesibilidad, describirViolaciones } from './support/a11y';
import { api, enDias, marca, overflowHorizontal } from './support/calendario';
import { desactivarTour } from './support/realtime';

/**
 * Sprint 10: el Calendario de Sprints de Administración lee las reuniones de
 * Administración del backend real en Día, Semana, Mes y Lista. La reunión se
 * prepara por la API (el seed no trae ninguna) y se cancela al terminar. La
 * gestión desde la interfaz (programar, editar, cancelar) la cubre
 * `admin-reuniones-gestion.spec.ts`; aquí solo se comprueba que sus acciones
 * aparecen en la tarjeta de quien puede gestionarla.
 */
const ADMIN = 'admin@uvg.edu.gt';

const clave = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

test.describe('Calendario administrativo: reuniones reales en las cuatro vistas (Sprint 10)', () => {
  test('una reunión aparece a su hora con su detalle y sus acciones de gestión, y al cancelarse sale de la agenda', async ({ page }, testInfo) => {
    await login(page, ADMIN, '/dashboard/admin');
    const inicio = enDias(2, 10);
    const fin = enDias(2, 11);

    const elegibles = await api(
      page,
      'get',
      `/api/admin/reuniones/proyectos-elegibles?fechaInicio=${inicio.toISOString()}&fechaFin=${fin.toISOString()}`,
    );
    expect(elegibles.status()).toBe(200);
    const proyectos = (await elegibles.json()) as { idProyecto: number; tituloProyecto: string }[];
    expect(proyectos.length, 'el seed debe tener al menos un proyecto convocable').toBeGreaterThan(0);
    const proyecto = proyectos[0];

    const titulo = marca(testInfo, 'E2E reunión admin');
    const creada = await api(page, 'post', '/api/admin/reuniones', {
      tituloEvento: titulo,
      fechaInicio: inicio.toISOString(),
      fechaFin: fin.toISOString(),
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/e2e-admin-calendario',
      proyectos: [proyecto.idProyecto],
    });
    expect(creada.status()).toBe(201);
    const { idReunion } = (await creada.json()) as { idReunion: number };
    const dia = clave(inicio);

    try {
      // Semana: el bloque va a su hora real y abre su tarjeta en el panel del día.
      await page.goto(`/dashboard/admin/sprints?vista=semana&fecha=${dia}`);
      const bloque = page.getByRole('button', { name: `${titulo}, 10:00 a 11:00` });
      await expect(bloque).toBeVisible({ timeout: 15_000 });
      await bloque.click();
      const tarjeta = page.locator('li[aria-current="true"]');
      await expect(tarjeta).toContainText(titulo);
      await expect(tarjeta).toContainText('10:00 – 11:00');
      await expect(tarjeta).toContainText('Virtual');
      await expect(tarjeta).toContainText('1 equipo');
      await expect(tarjeta).toContainText(/\d+ personas?/);
      await expect(tarjeta.getByRole('link', { name: `Ver proyecto ${proyecto.tituloProyecto}` })).toHaveAttribute(
        'href',
        `/dashboard/admin/proyectos/${proyecto.idProyecto}`,
      );

      // Día y Mes.
      await page.goto(`/dashboard/admin/sprints?vista=dia&fecha=${dia}`);
      await expect(page.getByRole('button', { name: `${titulo}, 10:00 a 11:00` })).toBeVisible({ timeout: 15_000 });
      await page.goto(`/dashboard/admin/sprints?vista=mes&fecha=${dia}`);
      await expect(page.getByRole('button', { name: /, (1 reunión administrativa|\d+ reuniones administrativas)$/ }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('region').filter({ hasText: titulo })).toBeVisible();

      // Lista: agenda activa.
      await page.goto(`/dashboard/admin/sprints?vista=lista&fecha=${dia}`);
      await expect(page.getByRole('cell', { name: titulo })).toBeVisible({ timeout: 15_000 });

      // Quien la creó puede gestionarla desde su tarjeta; ningún diálogo se abre solo.
      await page.goto(`/dashboard/admin/sprints?vista=semana&fecha=${dia}`);
      await page.getByRole('button', { name: `${titulo}, 10:00 a 11:00` }).click();
      const elegida = page.locator('li[aria-current="true"]');
      await expect(elegida.getByRole('button', { name: `Editar reunión ${titulo}` })).toBeVisible();
      await expect(elegida.getByRole('button', { name: `Cancelar reunión ${titulo}` })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Sin desbordar la página en móvil.
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`/dashboard/admin/sprints?vista=mes&fecha=${dia}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Calendario de Sprints' })).toBeVisible();
      expect(await overflowHorizontal(page)).toBeLessThanOrEqual(0);
    } finally {
      expect((await api(page, 'delete', `/api/admin/reuniones/${idReunion}`)).status()).toBe(200);
    }

    // Cancelada: deja de aparecer como actividad.
    await page.goto(`/dashboard/admin/sprints?vista=semana&fecha=${dia}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendario de Sprints' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('reuniones administrativas', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(titulo)).toHaveCount(0);
  });

  test('axe: Día, Semana, Mes y Lista sin violaciones graves ni críticas de WCAG A/AA, en claro y oscuro', async ({ page }, testInfo) => {
    await desactivarTour(page);
    await login(page, ADMIN, '/dashboard/admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    const inicio = enDias(1, 9);
    const elegibles = await api(page, 'get', `/api/admin/reuniones/proyectos-elegibles?fechaInicio=${inicio.toISOString()}`);
    const [proyecto] = (await elegibles.json()) as { idProyecto: number }[];
    const creada = await api(page, 'post', '/api/admin/reuniones', {
      tituloEvento: marca(testInfo, 'E2E axe reunión'),
      fechaInicio: inicio.toISOString(),
      fechaFin: enDias(1, 10).toISOString(),
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/e2e-admin-axe',
      proyectos: [proyecto.idProyecto],
    });
    expect(creada.status()).toBe(201);
    const { idReunion } = (await creada.json()) as { idReunion: number };
    try {
      for (const oscuro of [false, true]) {
        for (const vista of ['dia', 'semana', 'mes', 'lista']) {
          const tema = oscuro ? 'oscuro' : 'claro';
          await page.evaluate((t) => localStorage.setItem('theme', t), oscuro ? 'dark' : 'light');
          await page.goto(`/dashboard/admin/sprints?vista=${vista}&fecha=${clave(inicio)}`);
          await expect(page.getByRole('heading', { level: 1, name: 'Calendario de Sprints' })).toBeVisible({ timeout: 15_000 });
          await page.waitForLoadState('networkidle');
          await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
          const { violaciones, bloqueantes } = await analizarAccesibilidad(page, testInfo, `admin-calendario-${vista}-${tema}`);
          testInfo.annotations.push({ type: 'a11y', description: `${vista} ${tema}: ${violaciones.length} violación(es), ${bloqueantes.length} bloqueante(s)` });
          expect(describirViolaciones(bloqueantes), `${vista} (${tema})`).toEqual([]);
        }
      }
    } finally {
      await page.evaluate(() => localStorage.setItem('theme', 'light')).catch(() => undefined);
      expect((await api(page, 'delete', `/api/admin/reuniones/${idReunion}`)).status()).toBe(200);
    }
  });
});
