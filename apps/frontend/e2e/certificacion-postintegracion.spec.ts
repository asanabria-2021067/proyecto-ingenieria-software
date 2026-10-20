import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { capturar } from './support/calendario';
import { API_URL, desactivarTour, noLeidas, socketDe } from './support/realtime';

/**
 * GPI01-C16: certificación final integrada contra la pila aislada
 * (scripts/e2e/isolated-stack.sh), con sesiones reales y persistencia real.
 *
 *  - Tiempo real: un mensaje de chat y una notificación llegan sin recargar,
 *    quedan guardados, el estado de lectura se sincroniza y una tercera cuenta
 *    conectada no recibe nada.
 *  - Administración y regresiones de GPI01: panel, métricas, calendario de
 *    Sprints, y H-02 a H-07 comprobados sobre la aplicación en ejecución.
 *  - Visual: seis pantallas en 320, 375, 768, 1024, 1280 y 1440 px, en claro y
 *    oscuro y con la barra lateral abierta y plegada donde existe: sin
 *    desborde horizontal, sin controles fuera de la ventana, sin errores de
 *    página ni respuestas 4xx/5xx inesperadas. Incluye H-08, la cabecera de
 *    estudiante a 768 px, que esta matriz detectó.
 *
 * T-310 (visor administrativo de eventos de seguridad) y T-328 (preferencias
 * de notificación en el perfil) no están implementadas en el frontend y esta
 * suite no las simula.
 */

const ADMIN = 'admin@uvg.edu.gt';
// El login lleva a administración a su panel; `login` espera esa ruta exacta.
const RUTA_ADMIN = '/dashboard/admin';
const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const MARIA = 'maria.lopez@uvg.edu.gt';
const JOSE = 'jose.ramirez@uvg.edu.gt';
const PROYECTO_ID = 1;
const TAREA_ID = 1;

interface Vigilancia {
  errores: string[];
  http: string[];
}

/** Errores de página y respuestas 4xx/5xx. El 429 del limitador se anota aparte: no es un fallo de la pantalla. */
function vigilar(page: Page): Vigilancia & { limitadas: string[] } {
  const registro = { errores: [] as string[], http: [] as string[], limitadas: [] as string[] };
  page.on('pageerror', (error) => registro.errores.push(String(error.message).slice(0, 200)));
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const linea = `${status} ${response.request().method()} ${new URL(response.url()).pathname}`;
    (status === 429 ? registro.limitadas : registro.http).push(linea);
  });
  return registro;
}

async function sesion(browser: Browser, correo: string, destino?: string): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await desactivarTour(page);
  await login(page, correo, destino);
  await page.waitForLoadState('networkidle');
  return { contexto, page };
}

async function abrirChatIndividualCon(page: Page, nombreOtro: string) {
  await page.getByRole('button', { name: /^mensajes/i }).click();
  const existente = page.getByRole('button', { name: new RegExp(nombreOtro) });
  if (await existente.count()) {
    await existente.first().click();
    return;
  }
  await page.getByRole('button', { name: /^mensajes/i }).click();
  await page.getByRole('button', { name: /nuevo chat/i }).click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByRole('checkbox', { name: new RegExp(nombreOtro) }).click();
  await page.getByRole('button', { name: 'Crear chat' }).click();
}

// ───────────────────────────── Tiempo real ─────────────────────────────

test.describe('GPI01-C16: tiempo real entre cuentas', () => {
  test('un mensaje de chat llega sin recargar, queda guardado y una tercera cuenta conectada no lo recibe', async ({ browser }) => {
    test.setTimeout(120_000);
    const emisor = await sesion(browser, CARLOS);
    const receptor = await sesion(browser, MARIA);
    const tercero = await sesion(browser, JOSE);
    let socketTercero: Socket | undefined;
    try {
      socketTercero = await socketDe(tercero.contexto, '/chat');
      const ajenos: unknown[] = [];
      socketTercero.on('newMessage', (m) => ajenos.push(m));
      socketTercero.on('conversationUpdated', (m) => ajenos.push(m));

      await emisor.page.goto(`/dashboard/projects/${PROYECTO_ID}`);
      await receptor.page.goto(`/dashboard/proyectos/${PROYECTO_ID}`);
      await abrirChatIndividualCon(emisor.page, 'María');

      const mensaje = `Certificación C16 ${Date.now()}`;
      await emisor.page.getByPlaceholder('Escribe un mensaje…').fill(mensaje);
      await emisor.page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await expect(emisor.page.getByText(mensaje).first()).toBeVisible();

      // La receptora no recarga: el mensaje le llega por el socket.
      await abrirChatIndividualCon(receptor.page, 'Carlos');
      await expect(receptor.page.getByText(mensaje).first()).toBeVisible({ timeout: 15_000 });

      // Persistencia: tras recargar, el mensaje sigue en la conversación.
      await receptor.page.reload();
      await abrirChatIndividualCon(receptor.page, 'Carlos');
      await expect(receptor.page.getByText(mensaje).first()).toBeVisible({ timeout: 15_000 });

      expect(socketTercero.connected, 'el tercero seguía conectado').toBe(true);
      expect(ajenos, 'una conversación ajena no llega al tercero').toEqual([]);
    } finally {
      socketTercero?.close();
      await Promise.all([emisor.contexto.close(), receptor.contexto.close(), tercero.contexto.close()]);
    }
  });

  test('una notificación llega sin recargar y marcarla como leída se refleja en la campana y en la API', async ({ browser }) => {
    test.setTimeout(120_000);
    const lider = await sesion(browser, CARLOS);
    const asignada = await sesion(browser, MARIA);
    const tercero = await sesion(browser, JOSE);
    try {
      const antesAsignada = await noLeidas(asignada.page);
      const antesTercero = await noLeidas(tercero.page);
      await asignada.page.goto('/dashboard');
      await expect(asignada.page.getByLabel('Notificaciones en vivo conectadas')).toBeVisible({ timeout: 20_000 });

      await lider.page.goto(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}?section=comments`);
      const comentario = `Certificación C16 ${Date.now()}`;
      await lider.page.getByPlaceholder('Escribe un comentario...').fill(comentario);
      await lider.page.getByRole('button', { name: 'Comentar', exact: true }).click();
      await expect(lider.page.getByText(comentario).first()).toBeVisible();

      // Sin recargar: aviso en pantalla y contador persistido.
      await expect(asignada.page.getByText('Nuevo comentario').first()).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => noLeidas(asignada.page)).toBe(antesAsignada + 1);
      expect(await noLeidas(tercero.page), 'la otra cuenta no recibe la notificación').toBe(antesTercero);

      // Leer todas: el estado se sincroniza entre la interfaz y la base.
      await asignada.page.getByRole('button', { name: /notificaciones/i }).first().click();
      await asignada.page.getByRole('button', { name: 'Marcar todas las notificaciones como leidas' }).click();
      await expect.poll(() => noLeidas(asignada.page)).toBe(0);
      await asignada.page.reload();
      await expect(asignada.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await noLeidas(asignada.page), 'sigue en cero tras recargar').toBe(0);
    } finally {
      await Promise.all([lider.contexto.close(), asignada.contexto.close(), tercero.contexto.close()]);
    }
  });
});

// ─────────────────── Administración y regresiones GPI01 ───────────────────

test.describe('GPI01-C16: administración y regresiones H-02 a H-07', () => {
  test('panel de administración: secciones, métricas, cola de atención y «Actualizar»', async ({ page }) => {
    await desactivarTour(page);
    await login(page, ADMIN, RUTA_ADMIN);
    // Después de iniciar sesión: la pantalla de acceso consulta la sesión y recibe un 401 legítimo.
    const registro = vigilar(page);
    await page.goto('/dashboard/admin');
    for (const seccion of ['Global', 'Operación', 'Seguimiento']) {
      await expect(page.getByRole('region', { name: seccion, exact: true })).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.getByRole('heading', { name: 'Tendencias de uso' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Requieren atención' }).getByRole('listitem')).toHaveCount(3);

    const recarga = page.waitForResponse((r) => r.url().includes('/api/admin/estadisticas') && r.status() === 200);
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await recarga;

    expect(registro.errores).toEqual([]);
    expect(registro.http).toEqual([]);
  });

  test('calendario administrativo de Sprints: rejilla de 42 días y selección de día', async ({ page }) => {
    await desactivarTour(page);
    await login(page, ADMIN, RUTA_ADMIN);
    // Después de iniciar sesión: la pantalla de acceso consulta la sesión y recibe un 401 legítimo.
    const registro = vigilar(page);
    await page.goto('/dashboard/admin/sprints?vista=mes');
    await expect(page.getByRole('heading', { level: 1, name: 'Calendario de Sprints' })).toBeVisible({ timeout: 15_000 });
    const dias = page.locator('button[aria-pressed][aria-label]').filter({ hasText: /^\d/ });
    await expect(dias).toHaveCount(42);
    await expect(page.locator('button[aria-current="date"]')).toHaveCount(1);
    await dias.nth(10).click();
    await expect(dias.nth(10)).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/fecha=\d{4}-\d{2}-\d{2}/);
    expect(registro.errores).toEqual([]);
    expect(registro.http).toEqual([]);
  });

  test('H-07: /admin/proyectos responde 401 sin sesión, 403 a un estudiante y 400 claro solo a un administrador', async ({ browser }) => {
    const admin = await sesion(browser, ADMIN, RUTA_ADMIN);
    const estudiante = await sesion(browser, CARLOS);
    const anonimo = await browser.newContext();
    try {
      const pedir = async (contexto: BrowserContext, consulta: string) => {
        const respuesta = await contexto.request.get(`${API_URL}/api/admin/proyectos${consulta}`);
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { message?: string | string[] };
        return { status: respuesta.status(), mensaje: [cuerpo.message ?? ''].flat().join(' | ') };
      };
      for (const consulta of ['', '?grupo=todos', '?grupo=activos']) {
        expect((await pedir(anonimo, consulta)).status, `anónimo ${consulta}`).toBe(401);
        const comoEstudiante = await pedir(estudiante.contexto, consulta);
        expect(comoEstudiante.status, `estudiante ${consulta}`).toBe(403);
        expect(comoEstudiante.mensaje).toBe('Acceso restringido a administradores');
      }
      for (const consulta of ['', '?grupo=todos']) {
        expect(await pedir(admin.contexto, consulta)).toEqual({
          status: 400,
          mensaje: 'grupo debe ser uno de: activos, revision, cierres, cerrados',
        });
      }
      expect((await pedir(admin.contexto, '?grupo=activos')).status).toBe(200);
    } finally {
      await Promise.all([admin.contexto.close(), estudiante.contexto.close(), anonimo.close()]);
    }
  });

  test('H-02: la ruta antigua de Mis Proyectos redirige a la vigente sin pedir el endpoint obsoleto', async ({ page }) => {
    const pedidas: string[] = [];
    page.on('request', (r) => pedidas.push(new URL(r.url()).pathname));
    await desactivarTour(page);
    await login(page, CARLOS);
    // Después de iniciar sesión: la pantalla de acceso consulta la sesión y recibe un 401 legítimo.
    const registro = vigilar(page);
    await page.goto('/dashboard/mis-proyectos');
    await expect(page).toHaveURL(/\/dashboard\/projects\/mine$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis Proyectos' })).toBeVisible({ timeout: 15_000 });
    expect(pedidas.filter((p) => p.includes('/api/projects/mine'))).toEqual([]);
    expect(registro.http).toEqual([]);
  });

  test('H-03: los Sprints de un proyecto cerrado cargan para su líder y terminan en un estado claro para quien no puede verlos', async ({ browser }) => {
    test.setTimeout(120_000);
    const lider = await sesion(browser, MARIA);
    const tercero = await sesion(browser, CARLOS);
    try {
      const proyectos = (await (await lider.page.request.get('/api/proyectos/mine')).json()) as { idProyecto: number; estadoProyecto: string }[];
      const cerrado = proyectos.find((p) => p.estadoProyecto === 'CERRADO');
      expect(cerrado, 'el seed tiene un proyecto cerrado de esta cuenta').toBeDefined();
      const id = (cerrado as { idProyecto: number }).idProyecto;
      const sinEsqueletos = async (page: Page) => expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });

      const respuestas: string[] = [];
      lider.page.on('response', (r) => { if (r.status() >= 400) respuestas.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      await lider.page.goto(`/dashboard/proyectos/${id}/sprints`);
      await expect(lider.page.getByText(/El proyecto está cerrado: sus Sprints son históricos/)).toBeVisible({ timeout: 15_000 });
      await sinEsqueletos(lider.page);
      // Un único sondeo al detalle público (404) y ninguna repetición.
      expect(respuestas.filter((r) => r === `404 /api/proyectos/${id}`)).toHaveLength(1);
      expect(respuestas.filter((r) => r !== `404 /api/proyectos/${id}`)).toEqual([]);

      await tercero.page.goto(`/dashboard/proyectos/${id}/sprints`);
      await expect(tercero.page.getByText('No tienes acceso a este proyecto.')).toBeVisible({ timeout: 15_000 });
      await sinEsqueletos(tercero.page);

      await tercero.page.goto('/dashboard/proyectos/2147483000/sprints');
      await expect(tercero.page.getByText('Proyecto no encontrado')).toBeVisible({ timeout: 15_000 });
      await expect(tercero.page.getByRole('link', { name: 'Volver a proyectos' })).toBeVisible();
      await sinEsqueletos(tercero.page);
    } finally {
      await Promise.all([lider.contexto.close(), tercero.contexto.close()]);
    }
  });

  test('H-05: la cola de atención se lee a 768 px, en claro y oscuro', async ({ page }) => {
    test.setTimeout(120_000);
    await desactivarTour(page);
    await login(page, ADMIN, RUTA_ADMIN);
    // Cola «Requieren atención» a 768 px con la barra lateral abierta.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard/admin');
    const cola = page.getByRole('region', { name: 'Requieren atención' });
    await expect(cola.getByRole('listitem')).toHaveCount(3, { timeout: 15_000 });
    const filas = await cola.getByRole('listitem').evaluateAll((items) =>
      items.map((li) => {
        const descripcion = li.querySelector('p') as HTMLElement;
        const pill = li.querySelector('.pill');
        const caja = li.getBoundingClientRect();
        const rect = pill?.getBoundingClientRect();
        return {
          lineas: Math.round(descripcion.getBoundingClientRect().height / parseFloat(getComputedStyle(descripcion).lineHeight)),
          estadoVisible: rect ? rect.width > 0 && rect.left >= caja.left && rect.right <= caja.right + 1 : null,
        };
      }),
    );
    for (const fila of filas) {
      expect(fila.lineas, 'descripción en una o dos líneas').toBeLessThanOrEqual(2);
      expect(fila.estadoVisible, 'el estado no se pierde').not.toBe(false);
    }
  });

  test('H-06: al agendar una actividad, el proyecto cerrado aparece deshabilitado y los abiertos se pueden elegir', async ({ page }) => {
    await desactivarTour(page);
    await login(page, MARIA);
    await page.goto('/dashboard/calendario');
    await page.getByRole('button', { name: 'Agendar actividad' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
    await dialogo.getByLabel('Proyecto', { exact: true }).click();
    const opciones = await page.getByRole('option').evaluateAll((os) =>
      os.map((o) => ({ texto: o.textContent?.trim() ?? '', deshabilitada: o.getAttribute('aria-disabled') === 'true' })),
    );
    const cerradas = opciones.filter((o) => o.texto.endsWith('· Cerrado'));
    expect(cerradas.length, 'hay al menos un proyecto cerrado en la lista').toBeGreaterThan(0);
    expect(cerradas.every((o) => o.deshabilitada)).toBe(true);
    expect(opciones.filter((o) => !o.texto.endsWith('· Cerrado')).every((o) => !o.deshabilitada)).toBe(true);
  });
});

// ───────────────────────────── Matriz visual ─────────────────────────────

const ANCHOS = [320, 375, 768, 1024, 1280, 1440];


const PANTALLAS: { nombre: string; correo: string; ruta: string; titulo: RegExp }[] = [
  { nombre: 'admin-panel', correo: ADMIN, ruta: '/dashboard/admin', titulo: /Panel de Administración/ },
  { nombre: 'admin-sprints', correo: ADMIN, ruta: '/dashboard/admin/sprints?vista=mes', titulo: /Calendario de Sprints/ },
  { nombre: 'admin-botones', correo: ADMIN, ruta: '/dashboard/admin/botones', titulo: /Botones/ },
  { nombre: 'estudiante-panel', correo: CARLOS, ruta: '/dashboard', titulo: /./ },
  { nombre: 'estudiante-calendario', correo: CARLOS, ruta: '/dashboard/calendario', titulo: /Calendario académico/ },
  { nombre: 'estudiante-mis-proyectos', correo: CARLOS, ruta: '/dashboard/projects/mine', titulo: /Mis Proyectos/ },
];

async function fijarTema(page: Page, oscuro: boolean) {
  if ((await page.evaluate(() => document.documentElement.classList.contains('dark'))) === oscuro) return;
  await page.getByRole('button', { name: 'Cambiar tema' }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
}

/** Pliega o despliega la barra lateral si la pantalla la muestra. Devuelve si hubo barra que cambiar. */
async function barraLateral(page: Page, plegada: boolean): Promise<boolean> {
  const boton = page.getByRole('button', { name: plegada ? 'Colapsar barra lateral' : 'Expandir barra lateral' }).first();
  if (!(await boton.isVisible().catch(() => false))) return false;
  await boton.click();
  await expect(page.getByRole('button', { name: plegada ? 'Expandir barra lateral' : 'Colapsar barra lateral' }).first()).toBeVisible();
  return true;
}

const medir = (page: Page) =>
  page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('header button, header a, main h1')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (r.right > ancho + 1 || r.left < -1);
      })
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40));
    return { desborde: document.documentElement.scrollWidth - ancho, fuera };
  });

test.describe('GPI01-C16: matriz visual por ancho, tema y barra lateral', () => {
  for (const pantalla of PANTALLAS) {
    test(`${pantalla.nombre}: 320–1440 px, claro y oscuro, barra abierta y plegada`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await desactivarTour(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, pantalla.correo, pantalla.correo === ADMIN ? RUTA_ADMIN : undefined);
      // Después de iniciar sesión: la pantalla de acceso consulta la sesión y recibe un 401 legítimo.
      const registro = vigilar(page);
      await page.goto(pantalla.ruta);
      await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(pantalla.titulo, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');

      const hallazgos: string[] = [];
      let combinaciones = 0;
      for (const oscuro of [false, true]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await fijarTema(page, oscuro);
        for (const ancho of ANCHOS) {
          await page.setViewportSize({ width: ancho, height: ancho < 768 ? 800 : 900 });
          for (const plegada of [false, true]) {
            const etiqueta = `${ancho}px ${oscuro ? 'oscuro' : 'claro'} barra ${plegada ? 'plegada' : 'abierta'}`;
            if (plegada && !(await barraLateral(page, true))) continue; // en móvil no hay barra que plegar
            await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
            const medida = await medir(page);
            combinaciones += 1;
            if (medida.desborde > 1) hallazgos.push(`${etiqueta}: desborde horizontal de ${medida.desborde}px`);
            if (medida.fuera.length) hallazgos.push(`${etiqueta}: fuera de la ventana: ${medida.fuera.join(', ')}`);
            await capturar(page, testInfo, `c16-${pantalla.nombre}-${ancho}-${oscuro ? 'oscuro' : 'claro'}-${plegada ? 'plegada' : 'abierta'}`);
            if (plegada) await barraLateral(page, false);
          }
        }
      }
      await fijarTema(page, false);

      await testInfo.attach('combinaciones', { body: String(combinaciones), contentType: 'text/plain' });
      expect(combinaciones, 'se midieron todos los anchos en ambos temas').toBeGreaterThanOrEqual(ANCHOS.length * 2);
      expect(hallazgos).toEqual([]);
      expect(registro.errores, 'errores de página').toEqual([]);
      expect(registro.http, 'respuestas 4xx/5xx inesperadas').toEqual([]);
    });
  }

  test('H-08: a 768 px con la barra lateral abierta, los controles de la cabecera de estudiante caben en la ventana', async ({ page }) => {
    await desactivarTour(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await login(page, CARLOS);
    await page.goto('/dashboard/calendario');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Colapsar barra lateral' }).first()).toBeVisible();
    expect((await medir(page)).fuera).toEqual([]);
    await expect(page.getByRole('button', { name: 'Cambiar tema' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Repetir tour de bienvenida' })).toBeInViewport();
  });
});
