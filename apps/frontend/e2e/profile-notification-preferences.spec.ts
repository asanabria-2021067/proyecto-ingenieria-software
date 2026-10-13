import type { APIResponse, Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { medirContraste } from './support/accesibilidad';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * FG05-C03 (T-328): interruptores de notificación por tipo en el perfil, de
 * punta a punta contra la pila aislada y el backend de HU-185 SIN modificar.
 *
 *  - Persistencia real por tipo: se guarda, sobrevive a la recarga y a un
 *    inicio de sesión nuevo, y no afecta a otra cuenta.
 *  - Efecto real: con «Nuevo seguidor» desactivado, seguir a la cuenta no le
 *    crea notificación; reactivado, sí.
 *  - Fallo del backend (inducido interceptando la respuesta): el interruptor
 *    conserva su valor y lo explica.
 *  - Política real de tipos obligatorios: el backend no define ninguna.
 *  - Chat: no existe tipo de notificación; no hay interruptor. BLOQUEO de ese
 *    criterio, registrado como dependencia del backend (no se simula).
 *
 * Todo cambio se revierte al final: las cuentas terminan con todo activo.
 */

test.describe.configure({ mode: 'serial' });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const MARIA = 'maria.lopez@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';
const API = `${API_URL}/api`;
const PREFERENCIAS = `${API}/notificaciones/preferencias`;

let carlos: Page;
let maria: Page;

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return page;
}

/** El backend limita peticiones por IP: ante un 429 se espera y se repite, nunca se toca el límite. */
async function conReintento(page: Page, pedir: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await pedir();
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

type Preferencia = { tipo: string; activa: boolean };
const leer = async (page: Page): Promise<Preferencia[]> => (await conReintento(page, () => page.request.get(PREFERENCIAS))).json();
const inactivos = async (page: Page) => (await leer(page)).filter((p) => !p.activa).map((p) => p.tipo);
const guardar = (page: Page, tipo: string, activa: boolean) =>
  conReintento(page, () => page.request.put(PREFERENCIAS, { data: { tipo, activa } }));

async function restaurar(page: Page) {
  for (const tipo of await inactivos(page)) {
    expect((await guardar(page, tipo, true)).status()).toBe(200);
  }
}

/** Abre todas las familias: las preferencias viven en acordeones que empiezan cerrados. */
async function abrirFamilias(page: Page) {
  const seccion = page.getByRole('region', { name: 'Preferencias de notificaciones', exact: true });
  await expect(seccion.locator('[data-slot="accordion-trigger"]').first()).toBeVisible();
  const cerradas = seccion.locator('[data-slot="accordion-trigger"][aria-expanded="false"]');
  while ((await cerradas.count()) > 0) await cerradas.first().click();
  await expect(seccion.getByRole('switch').first()).toBeVisible();
  return seccion;
}

/** Las preferencias se movieron del perfil a Configuración; el nombre del helper se conserva. */
async function abrirPerfil(page: Page) {
  await page.goto('/dashboard/configuracion');
  const seccion = page.getByRole('region', { name: 'Preferencias de notificaciones', exact: true });
  await expect(seccion.getByRole('heading', { level: 2, name: 'Preferencias de notificaciones' })).toBeVisible();
  return abrirFamilias(page);
}

/**
 * Pulsa un interruptor y espera a que el servidor confirme el guardado.
 *
 * El backend limita las peticiones por IP (10 por segundo). Si responde 429,
 * el perfil lo explica y el interruptor no se mueve; como haría una persona,
 * se espera y se vuelve a pulsar. El límite real no se toca.
 */
async function pulsar(page: Page, nombre: string, esperado: boolean) {
  const control = page.getByRole('switch', { name: nombre, exact: true });
  for (let intento = 0; ; intento += 1) {
    const [respuesta] = await Promise.all([
      page.waitForResponse((r) => r.url() === PREFERENCIAS && r.request().method() === 'PUT'),
      control.click(),
    ]);
    if (respuesta.status() === 429 && intento < 12) {
      await expect(page.locator('li', { has: control }).getByRole('alert')).toHaveText(
        'Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.',
      );
      await expect(control).toHaveAttribute('aria-checked', String(!esperado));
      await page.waitForTimeout(1_100);
      continue;
    }
    expect(respuesta.status(), nombre).toBe(200);
    break;
  }
  await expect(control).toHaveAttribute('aria-checked', String(esperado));
  await expect(page.locator('li', { has: control }).getByRole('alert')).toHaveCount(0);
  return control;
}

test.beforeAll(async ({ browser }) => {
  carlos = await sesion(browser, CARLOS);
  maria = await sesion(browser, MARIA);
  await restaurar(carlos);
  await restaurar(maria);
});

test.afterAll(async () => {
  for (const page of [carlos, maria]) {
    if (page) {
      await restaurar(page);
      await page.context().close();
    }
  }
});

test.describe('FG05-C03: preferencias de notificación por tipo en el perfil', () => {
  test('el perfil muestra un interruptor por cada tipo real del backend, todos activos por defecto', async () => {
    const delBackend = await leer(carlos);
    expect(delBackend.length).toBeGreaterThanOrEqual(41);
    expect(delBackend.every((p) => p.activa)).toBe(true);

    const seccion = await abrirPerfil(carlos);
    await expect(seccion.getByRole('switch')).toHaveCount(delBackend.length);
    const enPantalla = await seccion.getByRole('switch').evaluateAll((els) => els.map((el) => el.getAttribute('data-tipo')));
    expect([...enPantalla].sort()).toEqual(delBackend.map((p) => p.tipo).sort());
    await expect(seccion.locator('[role="switch"][aria-checked="false"]')).toHaveCount(0);
    // Cada encabezado es el disparador de su familia: el título va en su propio elemento.
    await expect(seccion.locator('h3 [id^="preferencias-grupo-"]')).toHaveText([
      'Tareas e hitos',
      'Postulaciones y equipo',
      'Proyectos',
      'Horas y reconocimiento',
      'Recordatorios y calendario',
      'Red de contactos',
      'Cuenta y seguridad',
    ]);
    // El perfil sigue ahí, ya sin las preferencias.
    await carlos.goto('/dashboard/perfil');
    await expect(carlos.getByRole('button', { name: 'Editar perfil' })).toBeVisible();
    await expect(carlos.getByRole('switch')).toHaveCount(0);
  });

  test('Chat: no hay interruptor porque el backend no tiene ese tipo (criterio bloqueado, no simulado)', async () => {
    test.info().annotations.push({
      type: 'BLOCKED_DEPENDENCY',
      description: 'T-328 · interruptor de Chat: TipoNotificacion no tiene un tipo de chat y el chat no crea notificaciones. Requiere decisión y cambio del backend (HU-185).',
    });
    const tipos = (await leer(carlos)).map((p) => p.tipo);
    expect(tipos.filter((tipo) => /CHAT/.test(tipo))).toEqual([]);
    expect((await guardar(carlos, 'MENSAJE_CHAT', false)).status()).toBe(400);

    const seccion = await abrirPerfil(carlos);
    await expect(seccion.getByRole('switch', { name: /chat/i })).toHaveCount(0);
    await expect(seccion.getByText('Los mensajes de chat no se configuran aquí: llegan siempre por el chat y no generan notificaciones.')).toBeVisible();
  });

  test('un cambio se guarda en el servidor, sobrevive a la recarga y no afecta a otra cuenta', async () => {
    await abrirPerfil(carlos);
    await pulsar(carlos, 'Tarea asignada', false);
    expect(await inactivos(carlos)).toEqual(['TAREA_ASIGNADA']);

    await carlos.reload();
    const recargada = await abrirFamilias(carlos);
    await expect(carlos.getByRole('switch', { name: 'Tarea asignada', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(recargada.locator('[role="switch"][aria-checked="false"]')).toHaveCount(1);

    // María no ve el cambio de Carlos, ni en la API ni en su perfil.
    expect(await inactivos(maria)).toEqual([]);
    const seccionMaria = await abrirPerfil(maria);
    await expect(seccionMaria.locator('[role="switch"][aria-checked="false"]')).toHaveCount(0);

    // Y el cambio de María no toca el de Carlos.
    await pulsar(maria, 'Recordatorio de evento', false);
    expect(await inactivos(maria)).toEqual(['RECORDATORIO_EVENTO']);
    expect(await inactivos(carlos)).toEqual(['TAREA_ASIGNADA']);
  });

  test('la preferencia persiste tras cerrar sesión e iniciar una nueva', async ({ browser }) => {
    // Sesión nueva de verdad: formulario de acceso, sin reutilizar cookies. El acceso está limitado a
    // 5 intentos por minuto por IP; si otros specs agotaron la ventana, se espera y se repite una vez.
    test.setTimeout(180_000);
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await desactivarTour(page);
    for (let intento = 0; ; intento += 1) {
      await page.goto('/login');
      await page.getByPlaceholder('usuario@uvg.edu.gt').fill(CARLOS);
      await page.getByPlaceholder('Minimo 8 caracteres').fill('Test1234!');
      await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
      const entro = await page.waitForURL(/\/dashboard$/, { timeout: 15_000 }).then(() => true, () => false);
      if (entro) break;
      expect(intento, 'el inicio de sesión no entró ni tras esperar la ventana del límite').toBe(0);
      await page.waitForTimeout(61_000);
    }

    await abrirPerfil(page);
    await expect(page.getByRole('switch', { name: 'Tarea asignada', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Tarea actualizada', exact: true })).toHaveAttribute('aria-checked', 'true');
    await contexto.close();
  });

  test('cada tipo disponible se puede desactivar y volver a activar desde el perfil', async () => {
    test.setTimeout(240_000);
    await restaurar(carlos);
    const seccion = await abrirPerfil(carlos);
    const nombres = await seccion.getByRole('switch').evaluateAll((els) =>
      els.map((el) => (document.querySelector(`label[for="${el.id}"]`) as HTMLElement).innerText.trim()),
    );
    expect(new Set(nombres).size).toBe(nombres.length);

    for (const nombre of nombres) await pulsar(carlos, nombre, false);
    expect((await inactivos(carlos)).length).toBe(nombres.length);

    await carlos.reload();
    const trasRecarga = await abrirFamilias(carlos);
    await expect(trasRecarga.locator('[role="switch"][aria-checked="false"]')).toHaveCount(nombres.length);
    await expect(trasRecarga.locator('[role="switch"][aria-checked="true"]')).toHaveCount(0);

    for (const nombre of nombres) await pulsar(carlos, nombre, true);
    expect(await inactivos(carlos)).toEqual([]);
    // Nada de esto alcanzó a María.
    expect(await inactivos(maria)).toEqual(['RECORDATORIO_EVENTO']);
  });

  test('efecto real: con «Nuevo seguidor» desactivado no llega la notificación; reactivado, sí', async () => {
    const idMaria = (await (await maria.request.get(`${API}/usuarios/me`)).json()).idUsuario;
    const deSeguidor = async () =>
      ((await (await conReintento(maria, () => maria.request.get(`${API}/notificaciones`))).json()) as { tipoNotificacion: string }[]).filter(
        (n) => n.tipoNotificacion === 'NUEVO_SEGUIDOR',
      ).length;
    const seguir = () => conReintento(carlos, () => carlos.request.post(`${API}/social/seguimientos`, { data: { idSeguido: idMaria } }));
    const dejar = () => conReintento(carlos, () => carlos.request.delete(`${API}/social/seguimientos/${idMaria}`));

    await dejar();
    const antes = await deSeguidor();

    await abrirPerfil(maria);
    await pulsar(maria, 'Nuevo seguidor', false);
    expect((await seguir()).status()).toBeLessThan(300);
    expect(await deSeguidor(), 'desactivado: seguirla no crea notificación').toBe(antes);

    await dejar();
    await pulsar(maria, 'Nuevo seguidor', true);
    expect((await seguir()).status()).toBeLessThan(300);
    await expect.poll(deSeguidor, { message: 'reactivado: seguirla crea una notificación' }).toBe(antes + 1);
    await dejar();
  });

  test('si el backend falla al guardar, el interruptor conserva su valor, lo explica y nada cambia en el servidor', async () => {
    await restaurar(carlos);
    await abrirPerfil(carlos);
    const control = carlos.getByRole('switch', { name: 'Calendario compartido', exact: true });
    await expect(control).toHaveAttribute('aria-checked', 'true');

    // Fallo inducido: se intercepta SOLO el PUT y se responde 500. El backend no se toca.
    await carlos.route(PREFERENCIAS, (ruta) =>
      ruta.request().method() === 'PUT'
        ? ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Internal server error' }) })
        : ruta.continue(),
    );
    await control.focus();
    await control.press('Space');
    const fila = carlos.locator('li', { has: control });
    await expect(fila.getByRole('alert')).toHaveText('No se pudo guardar el cambio. El interruptor conserva su valor anterior.');
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(control).toBeFocused();
    expect(await inactivos(carlos)).toEqual([]);

    // Sin la interceptación, el mismo interruptor guarda y el error desaparece.
    await carlos.unroute(PREFERENCIAS);
    await pulsar(carlos, 'Calendario compartido', false);
    await expect(fila.getByRole('alert')).toHaveCount(0);
    await pulsar(carlos, 'Calendario compartido', true);
  });

  test('un 429 del backend se explica como exceso de cambios y no mueve el interruptor', async () => {
    await abrirPerfil(carlos);
    const control = carlos.getByRole('switch', { name: 'Horas validadas', exact: true });
    await carlos.route(PREFERENCIAS, (ruta) =>
      ruta.request().method() === 'PUT'
        ? ruta.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }) })
        : ruta.continue(),
    );
    await control.click();
    await expect(carlos.locator('li', { has: control }).getByRole('alert')).toHaveText(
      'Demasiados cambios seguidos. Espera unos segundos y vuelve a intentarlo.',
    );
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await carlos.unroute(PREFERENCIAS);
  });

  test('política real de tipos obligatorios: el backend no define ninguna y el perfil no inventa una', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN);
    try {
      await restaurar(admin);
      const seccion = await abrirPerfil(admin);
      await expect(seccion.locator('[role="switch"][disabled], [role="switch"][aria-disabled="true"]')).toHaveCount(0);
      await expect(seccion.getByText(/obligatori/i)).toHaveCount(0);

      // Incluso la alerta de seguridad admite desactivarse: así responde hoy el backend.
      await pulsar(admin, 'Alerta de seguridad', false);
      expect(await inactivos(admin)).toEqual(['ALERTA_SEGURIDAD']);
      await pulsar(admin, 'Alerta de seguridad', true);
      expect(await inactivos(admin)).toEqual([]);
    } finally {
      await restaurar(admin);
      await admin.context().close();
    }
  });

  test('sin sesión, las preferencias no se leen ni se cambian', async ({ browser }) => {
    const contexto = await browser.newContext();
    expect((await contexto.request.get(PREFERENCIAS)).status()).toBe(401);
    expect((await contexto.request.put(PREFERENCIAS, { data: { tipo: 'TAREA_ASIGNADA', activa: false } })).status()).toBe(401);
    await contexto.close();
  });

  test('la sección se ajusta a 375, 768 y 1440 px en claro y oscuro, con contraste AA y foco visible', async () => {
    test.setTimeout(180_000);
    const hallazgos: string[] = [];
    for (const oscuro of [false, true]) {
      await carlos.setViewportSize({ width: 1440, height: 900 });
      await abrirPerfil(carlos);
      if ((await carlos.evaluate(() => document.documentElement.classList.contains('dark'))) !== oscuro) {
        await carlos.getByRole('button', { name: 'Cambiar tema' }).first().click();
        await expect.poll(() => carlos.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
      }
      for (const ancho of [375, 768, 1440]) {
        const etiqueta = `${ancho}px ${oscuro ? 'oscuro' : 'claro'}`;
        await carlos.setViewportSize({ width: ancho, height: ancho < 768 ? 800 : 900 });
        const seccion = await abrirPerfil(carlos);
        await seccion.scrollIntoViewIfNeeded();
        const medida = await seccion.evaluate((el) => {
          const ventana = document.documentElement.clientWidth;
          const caja = el.getBoundingClientRect();
          const controles = [...el.querySelectorAll<HTMLElement>('[role="switch"]')];
          return {
            desborde: document.documentElement.scrollWidth - ventana,
            seccionFuera: caja.left < -1 || caja.right > ventana + 1,
            controlesFuera: controles.filter((c) => {
              const r = c.getBoundingClientRect();
              return r.left < caja.left - 1 || r.right > caja.right + 1 || r.width < 20;
            }).length,
            etiquetasRecortadas: [...el.querySelectorAll<HTMLElement>('label, li p')].filter((t) => t.scrollWidth > t.clientWidth + 1).length,
            columnas: new Set(controles.map((c) => Math.round(c.getBoundingClientRect().right))).size,
          };
        });
        if (medida.desborde > 1) hallazgos.push(`${etiqueta}: desborde horizontal de ${medida.desborde}px`);
        if (medida.seccionFuera) hallazgos.push(`${etiqueta}: la sección sale de la ventana`);
        if (medida.controlesFuera) hallazgos.push(`${etiqueta}: ${medida.controlesFuera} interruptores fuera de su tarjeta`);
        if (medida.etiquetasRecortadas) hallazgos.push(`${etiqueta}: ${medida.etiquetasRecortadas} textos recortados`);
        // Las familias se apilan: una sola columna de interruptores a cualquier ancho.
        if (medida.columnas !== 1) hallazgos.push(`${etiqueta}: se esperaba una columna y hay ${medida.columnas}`);

        const contrastes = await medirContraste(
          carlos,
          '[aria-labelledby="preferencias-notificacion-titulo"] h2, [aria-labelledby="preferencias-notificacion-titulo"] h3 span, [aria-labelledby="preferencias-notificacion-titulo"] p, [aria-labelledby="preferencias-notificacion-titulo"] label',
        );
        expect(contrastes.length, `${etiqueta}: se midió texto`).toBeGreaterThan(80);
        for (const c of contrastes.filter((c) => c.ratio < 4.5)) {
          hallazgos.push(`${etiqueta}: contraste ${c.ratio}:1 en «${c.texto}» (${c.color} sobre ${c.fondo})`);
        }
      }
    }
    expect([...new Set(hallazgos)], 'hallazgos de presentación').toEqual([]);

    // Foco visible al llegar con el teclado, en el tema que quedó (oscuro) y en claro.
    await carlos.setViewportSize({ width: 1440, height: 900 });
    for (const oscuro of [true, false]) {
      if ((await carlos.evaluate(() => document.documentElement.classList.contains('dark'))) !== oscuro) {
        await carlos.getByRole('button', { name: 'Cambiar tema' }).first().click();
        await expect.poll(() => carlos.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
      }
      const seccion = await abrirPerfil(carlos);
      const primero = seccion.getByRole('switch').first();
      const segundo = seccion.getByRole('switch').nth(1);
      await primero.focus();
      await carlos.keyboard.press('Tab');
      await expect(segundo).toBeFocused();
      const anillo = await segundo.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(anillo, `foco visible en tema ${oscuro ? 'oscuro' : 'claro'}`).not.toBe('none');
    }
  });
});
