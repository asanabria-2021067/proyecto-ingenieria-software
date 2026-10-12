import type { APIResponse, Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

/**
 * GPI01-C15 (HU-177): actividades del proyecto y asistencia contra la
 * aplicación real y aislada (scripts/e2e/isolated-stack.sh): backend, base
 * sembrada y sesiones reales.
 *
 * El frontend todavía NO tiene pantalla para crear actividades ni marcar
 * asistencia: esas dos acciones se ejercen aquí por la API real con la sesión
 * del navegador, y lo que sí existe en pantalla se comprueba en pantalla: las
 * horas acreditadas en «Mis Horas» y los eventos en la bitácora del proyecto.
 * Las reglas de dominio y la idempotencia a nivel de fila las cubre
 * attendance-http.integration.spec.ts.
 *
 * No existe una ruta para eliminar actividades: las que crea esta suite
 * quedan en la base desechable. La asistencia sí se retira al terminar, así
 * que las horas acreditadas vuelven a su valor inicial.
 *
 * Reparto del seed: carlos lidera «Plataforma de Tutorías UVG» (integrantes
 * maria y jose) y «Sistema de Inventario Verde» (en solicitud de cierre);
 * maria lidera «Feria de Ciencias UVG 2026» (cerrado).
 */

const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CORREO_INTEGRANTE = 'maria.lopez@uvg.edu.gt';
const PROYECTO = 'Plataforma de Tutorías UVG';
const PROYECTO_EN_CIERRE = 'Sistema de Inventario Verde';
const PROYECTO_CERRADO = 'Feria de Ciencias UVG 2026';
const HORAS = 1.5;

type Metodo = 'GET' | 'POST' | 'PATCH';

async function pedir(page: Page, method: Metodo, ruta: string, data?: unknown): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.fetch(ruta, { method, data });
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

async function json<T>(page: Page, ruta: string): Promise<T> {
  const respuesta = await pedir(page, 'GET', ruta);
  expect(respuesta.status(), ruta).toBe(200);
  return (await respuesta.json()) as T;
}

async function sesion(browser: Browser, correo: string): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return original.call(this, key);
    };
  });
  await login(page, correo);
  await page.waitForLoadState('networkidle');
  return { contexto, page };
}

const miId = async (page: Page) => (await json<{ idUsuario: number }>(page, '/api/usuarios/me')).idUsuario;

async function idProyecto(page: Page, titulo: string): Promise<number> {
  const proyectos = await json<{ idProyecto: number; tituloProyecto: string }[]>(page, '/api/proyectos/mine');
  const proyecto = proyectos.find((p) => p.tituloProyecto === titulo);
  if (!proyecto) throw new Error(`El seed no tiene el proyecto «${titulo}» para esta cuenta`);
  return proyecto.idProyecto;
}

/** Horas acreditadas de la cuenta, tal como las lee «Mis Horas». */
const acreditadas = async (page: Page) =>
  Number((await json<{ totales: { acreditadas: string } }>(page, '/api/usuarios/me/horas')).totales.acreditadas);

const hoy = () => new Date().toISOString().slice(0, 10);

const cuerpo = (titulo: string) => ({ tituloActividad: titulo, tipoActividad: 'TALLER', fechaActividad: hoy(), horasValor: HORAS });

interface Actividad {
  idActividad: number;
  tituloActividad: string;
  totalAsistieron: number;
}
interface Detalle {
  integrantes: { idUsuario: number; asistio: boolean }[];
}

/** Total de «ACREDITADAS» que pinta la página Mis Horas. */
async function acreditadasEnPantalla(page: Page): Promise<number> {
  await page.goto('/dashboard/mis-horas');
  const tarjeta = page.getByRole('group', { name: 'Acreditadas' }).first();
  await expect(tarjeta).toContainText(/\d+(\.\d+)? h/, { timeout: 15_000 });
  return Number(((await tarjeta.innerText()).match(/(\d+(?:\.\d+)?) h/) as RegExpMatchArray)[1]);
}

test.describe('GPI01-C15: actividad y asistencia con efectos reales', () => {
  test('el líder crea una actividad y confirma asistencia: las horas se acreditan una sola vez, se ven en Mis Horas y en la bitácora, y se retiran al quitarla', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const titulo = `C15 taller ${Date.now()}-${testInfo.workerIndex}${testInfo.retry}`;
    const lider = await sesion(browser, CORREO_LIDER);
    const integrante = await sesion(browser, CORREO_INTEGRANTE);
    let rutaAsistencia = '';
    try {
      const proyecto = await idProyecto(lider.page, PROYECTO);
      const idIntegrante = await miId(integrante.page);
      const horasIniciales = await acreditadas(integrante.page);
      expect(await acreditadasEnPantalla(integrante.page), 'la página parte del mismo total que la API').toBe(horasIniciales);

      // ── Crear ──────────────────────────────────────────────────────────
      const creada = await pedir(lider.page, 'POST', `/api/proyectos/${proyecto}/actividades`, cuerpo(titulo));
      expect(creada.status(), 'crear la actividad').toBe(201);
      const { idActividad } = (await creada.json()) as Actividad;
      rutaAsistencia = `/api/proyectos/${proyecto}/actividades/${idActividad}/asistencia/${idIntegrante}`;

      // La integrante la ve en la lista y aparece como integrante sin asistencia.
      const lista = await json<Actividad[]>(integrante.page, `/api/proyectos/${proyecto}/actividades`);
      expect(lista.find((a) => a.idActividad === idActividad)).toMatchObject({ tituloActividad: titulo, totalAsistieron: 0 });
      const antes = await json<Detalle>(integrante.page, `/api/proyectos/${proyecto}/actividades/${idActividad}`);
      expect(antes.integrantes.find((i) => i.idUsuario === idIntegrante)).toMatchObject({ asistio: false });

      // ── Confirmar asistencia ───────────────────────────────────────────
      const marcada = await pedir(lider.page, 'PATCH', rutaAsistencia, { asistio: true });
      expect(marcada.status()).toBe(200);
      const { idRegistroHoras } = (await marcada.json()) as { idRegistroHoras: number };
      expect(await acreditadas(integrante.page), 'horas acreditadas').toBe(horasIniciales + HORAS);

      // Repetir no vuelve a acreditar.
      const repetida = await pedir(lider.page, 'PATCH', rutaAsistencia, { asistio: true });
      expect(((await repetida.json()) as { idRegistroHoras: number }).idRegistroHoras).toBe(idRegistroHoras);
      expect(await acreditadas(integrante.page), 'sin doble acreditación').toBe(horasIniciales + HORAS);

      const despues = await json<Detalle>(integrante.page, `/api/proyectos/${proyecto}/actividades/${idActividad}`);
      expect(despues.integrantes.find((i) => i.idUsuario === idIntegrante)).toMatchObject({ asistio: true });

      // En pantalla: Mis Horas de la integrante y la bitácora del proyecto.
      expect(await acreditadasEnPantalla(integrante.page), 'Mis Horas refleja lo acreditado').toBe(horasIniciales + HORAS);
      await lider.page.goto(`/dashboard/proyectos/${proyecto}/bitacora`);
      await expect(lider.page.getByText('Asistencia marcada').first()).toBeVisible({ timeout: 15_000 });
      await expect(lider.page.getByText('Actividad creada').first()).toBeVisible();

      // ── Quitar la asistencia ───────────────────────────────────────────
      const quitada = await pedir(lider.page, 'PATCH', rutaAsistencia, { asistio: false });
      expect(quitada.status()).toBe(200);
      expect(await quitada.json()).toMatchObject({ asistio: false, idRegistroHoras: null });
      rutaAsistencia = '';
      expect(await acreditadas(integrante.page), 'las horas vuelven a su valor').toBe(horasIniciales);
      expect(await acreditadasEnPantalla(integrante.page)).toBe(horasIniciales);
    } finally {
      if (rutaAsistencia) await pedir(lider.page, 'PATCH', rutaAsistencia, { asistio: false });
      await Promise.all([lider.contexto.close(), integrante.contexto.close()]);
    }
  });
});

test.describe('GPI01-C15: quién puede y en qué estado del proyecto', () => {
  test('una integrante no crea ni marca (ni su propia asistencia); un anónimo tampoco; solo se marca a quien participa', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const titulo = `C15 permisos ${Date.now()}-${testInfo.workerIndex}${testInfo.retry}`;
    const lider = await sesion(browser, CORREO_LIDER);
    const integrante = await sesion(browser, CORREO_INTEGRANTE);
    const anonimo = await browser.newContext();
    try {
      const proyecto = await idProyecto(lider.page, PROYECTO);
      const [idLider, idIntegrante] = [await miId(lider.page), await miId(integrante.page)];
      const horasIniciales = await acreditadas(integrante.page);
      const creada = await pedir(lider.page, 'POST', `/api/proyectos/${proyecto}/actividades`, cuerpo(titulo));
      expect(creada.status()).toBe(201);
      const { idActividad } = (await creada.json()) as Actividad;
      const base = `/api/proyectos/${proyecto}/actividades`;

      // Integrante: lee, pero no escribe.
      expect((await pedir(integrante.page, 'POST', base, cuerpo(`${titulo} intrusa`))).status()).toBe(403);
      expect((await pedir(integrante.page, 'PATCH', `${base}/${idActividad}/asistencia/${idIntegrante}`, { asistio: true })).status()).toBe(403);
      expect((await pedir(integrante.page, 'GET', `${base}/${idActividad}`)).status()).toBe(200);

      // Anónimo.
      const pagina = await anonimo.newPage();
      expect((await pedir(pagina, 'GET', base)).status()).toBe(401);
      expect((await pedir(pagina, 'POST', base, cuerpo(titulo))).status()).toBe(401);
      expect((await pedir(pagina, 'PATCH', `${base}/${idActividad}/asistencia/${idIntegrante}`, { asistio: true })).status()).toBe(401);

      // Destinatario que no participa en el proyecto: una persona ajena del seed.
      const ajena = await json<{ items: { idUsuario: number }[] }>(lider.page, '/api/social/usuarios/buscar?q=Valentina');
      expect(ajena.items.length).toBeGreaterThan(0);
      expect(ajena.items[0].idUsuario).not.toBe(idLider);
      const rechazo = await pedir(lider.page, 'PATCH', `${base}/${idActividad}/asistencia/${ajena.items[0].idUsuario}`, { asistio: true });
      expect(rechazo.status()).toBe(400);
      expect((await pedir(lider.page, 'PATCH', `${base}/2147483000/asistencia/${idIntegrante}`, { asistio: true })).status()).toBe(404);

      // Nada de lo anterior acreditó horas ni marcó asistencia.
      const detalle = await json<Detalle>(lider.page, `${base}/${idActividad}`);
      expect(detalle.integrantes.every((i) => !i.asistio)).toBe(true);
      const lista = await json<Actividad[]>(lider.page, base);
      expect(lista.some((a) => a.tituloActividad === `${titulo} intrusa`)).toBe(false);
      expect(await acreditadas(integrante.page)).toBe(horasIniciales);
    } finally {
      await Promise.all([lider.contexto.close(), integrante.contexto.close(), anonimo.close()]);
    }
  });

  test('un proyecto en solicitud de cierre o cerrado no admite actividades nuevas (409), ni siquiera de su líder', async ({ browser }, testInfo) => {
    const titulo = `C15 congelado ${Date.now()}-${testInfo.workerIndex}${testInfo.retry}`;
    const carlos = await sesion(browser, CORREO_LIDER);
    const maria = await sesion(browser, CORREO_INTEGRANTE);
    try {
      for (const [page, proyecto] of [[carlos.page, PROYECTO_EN_CIERRE], [maria.page, PROYECTO_CERRADO]] as const) {
        const id = await idProyecto(page, proyecto);
        const antes = (await pedir(page, 'GET', `/api/proyectos/${id}/actividades`)).status();
        const respuesta = await pedir(page, 'POST', `/api/proyectos/${id}/actividades`, cuerpo(titulo));
        expect(respuesta.status(), proyecto).toBe(409);
        // La lectura sigue respondiendo lo mismo que antes del intento, sin la actividad rechazada.
        const lectura = await pedir(page, 'GET', `/api/proyectos/${id}/actividades`);
        expect(lectura.status(), proyecto).toBe(antes);
        if (lectura.status() === 200) {
          expect(((await lectura.json()) as Actividad[]).some((a) => a.tituloActividad === titulo), proyecto).toBe(false);
        }
      }
    } finally {
      await Promise.all([carlos.contexto.close(), maria.contexto.close()]);
    }
  });
});
