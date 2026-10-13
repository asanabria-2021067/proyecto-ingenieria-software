import type { APIResponse, Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import {
  CORREO_INVITADA,
  CORREO_LIDER,
  LINK,
  PROYECTO,
  borrarEventosConTitulo,
  enDias,
  eventosConTitulo,
  fijarRelojMananaTemprano,
  idDelProyecto,
  marca,
} from './support/calendario';

/**
 * GPI01-C14: invitados, agenda compartida y revocación, de extremo a extremo
 * contra servicios reales y aislados (scripts/e2e/isolated-stack.sh).
 *
 * Complementa calendario-compartido.spec.ts (que recorre el flujo en la
 * interfaz entre el líder y una integrante) con lo que faltaba certificar en
 * navegador: visibilidad por invitados y su cambio al editar, el aviso
 * persistido y que no se repite, el contrato mínimo de un evento ajeno en la
 * red y en pantalla, el enlace del aviso, revocación desde las dos partes y
 * los accesos de un tercero. Las entradas inválidas de `POST /compartidos`
 * (uno mismo, inexistente, cuerpo mal formado) ya las cubre
 * calendar-shares-http.integration.spec.ts y aquí no se repiten: cada POST
 * consume el cupo de 5 por minuto que comparten todas las suites.
 *
 * Reparto del seed: carlos lidera el Proyecto 1 (integrantes maria y jose);
 * jose lidera «Robot Seguidor de Línea», donde maria NO participa.
 */

const CORREO_JOSE = 'jose.ramirez@uvg.edu.gt';
const PROYECTO_DE_JOSE = 'Robot Seguidor de Línea';
const RUTA_COMPARTIDOS = '/api/usuarios/me/calendario/compartidos';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function pedir(page: Page, method: Metodo, ruta: string, data?: unknown): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.fetch(ruta, { method, data });
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

/**
 * `POST /compartidos` admite 5 peticiones por minuto POR IP (también las
 * anónimas y las inválidas), y en la pila de pruebas todas salen de la misma.
 * El límite no se toca ni se esquiva: si responde 429 se espera a que la
 * ventana avance y se repite.
 */
async function compartir(page: Page, data: unknown): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.fetch(RUTA_COMPARTIDOS, { method: 'POST', data });
    if (respuesta.status() !== 429 || intento >= 16) return respuesta;
    await page.waitForTimeout(5_000);
  }
}

async function json<T>(page: Page, ruta: string): Promise<T> {
  const respuesta = await pedir(page, 'GET', ruta);
  expect(respuesta.status(), ruta).toBe(200);
  return (await respuesta.json()) as T;
}

const miId = async (page: Page) => (await json<{ idUsuario: number }>(page, '/api/usuarios/me')).idUsuario;

/** Página con sesión real de `correo` en un contexto propio, cargada del todo antes de abrir la siguiente. */
async function sesion(browser: Browser, correo: string): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await fijarRelojMananaTemprano(page);
  await login(page, correo);
  await page.waitForLoadState('networkidle');
  return { contexto, page };
}

const rango = () =>
  `desde=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&hasta=${encodeURIComponent(new Date(Date.now() + 20 * 86_400_000).toISOString())}`;

const agenda = (page: Page, idPropietario: number) =>
  pedir(page, 'GET', `/api/usuarios/me/calendario/compartidos-conmigo/${idPropietario}/agenda?${rango()}`);

interface Relaciones {
  compartidoPorMi: { idUsuario: number }[];
  compartidosConmigo: { idUsuario: number }[];
}
const relaciones = (page: Page) => json<Relaciones>(page, RUTA_COMPARTIDOS);

interface Aviso {
  tipoNotificacion: string;
  datosJson: { ownerId?: number } | null;
}
const avisosDeCalendario = async (page: Page, idPropietario: number) =>
  (await json<Aviso[]>(page, '/api/notificaciones')).filter(
    (n) => n.tipoNotificacion === 'CALENDARIO_COMPARTIDO' && n.datosJson?.ownerId === idPropietario,
  );

test.describe('GPI01-C14: visibilidad de un evento por sus invitados', () => {
  test('solo el líder y los invitados ven el evento; al ampliar o vaciar la lista cambia quién lo ve; un invitado ajeno se rechaza', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const titulo = marca(testInfo, 'C14 invitados');
    const lider = await sesion(browser, CORREO_LIDER);
    const maria = await sesion(browser, CORREO_INVITADA);
    const jose = await sesion(browser, CORREO_JOSE);
    try {
      const idProyecto = await idDelProyecto(lider.page, PROYECTO);
      const [idMaria, idJose] = [await miId(maria.page), await miId(jose.page)];
      const ruta = `/api/proyectos/${idProyecto}/eventos`;
      const cuerpo = {
        tituloEvento: titulo,
        fechaInicio: enDias(2, 9).toISOString(),
        fechaFin: enDias(2, 10).toISOString(),
        modalidad: 'VIRTUAL',
        linkSesion: LINK,
        tipoEvento: 'REUNION',
      };

      // Invitada: solo maria. jose integra el proyecto pero no fue invitado.
      const creado = await pedir(lider.page, 'POST', ruta, { ...cuerpo, invitados: [idMaria] });
      expect(creado.status()).toBe(201);
      const { idEvento } = (await creado.json()) as { idEvento: number };

      expect(await eventosConTitulo(lider.page, titulo)).toHaveLength(1);
      expect(await eventosConTitulo(maria.page, titulo)).toHaveLength(1);
      expect(await eventosConTitulo(jose.page, titulo), 'un integrante no invitado no lo recibe').toHaveLength(0);

      // Lo mismo en pantalla, con datos reales.
      for (const [quien, visible] of [[maria.page, true], [jose.page, false]] as const) {
        await quien.goto('/dashboard/calendario');
        await quien.getByRole('radio', { name: 'Mes' }).click();
        await expect(quien.getByRole('heading', { level: 1 })).toBeVisible();
        if (visible) await expect(quien.getByText(titulo).first()).toBeVisible({ timeout: 15_000 });
        else await expect(quien.getByText(titulo)).toHaveCount(0);
      }

      // Ampliar la lista: ahora jose también lo ve.
      expect((await pedir(lider.page, 'PATCH', `${ruta}/${idEvento}`, { invitados: [idMaria, idJose] })).status()).toBe(200);
      expect(await eventosConTitulo(jose.page, titulo)).toHaveLength(1);

      // Quitar a maria: deja de verlo; jose lo conserva.
      expect((await pedir(lider.page, 'PATCH', `${ruta}/${idEvento}`, { invitados: [idJose] })).status()).toBe(200);
      expect(await eventosConTitulo(maria.page, titulo), 'quien sale de la lista pierde el evento').toHaveLength(0);
      expect(await eventosConTitulo(jose.page, titulo)).toHaveLength(1);

      // Lista vacía: vuelve a ser de todo el proyecto.
      expect((await pedir(lider.page, 'PATCH', `${ruta}/${idEvento}`, { invitados: [] })).status()).toBe(200);
      expect(await eventosConTitulo(maria.page, titulo)).toHaveLength(1);

      // Un invitado que no integra el proyecto es un 400 y no altera nada.
      const ajeno = await json<{ items: { idUsuario: number }[] }>(lider.page, '/api/social/usuarios/buscar?q=Valentina');
      expect(ajeno.items.length, 'el seed tiene a una persona ajena al proyecto').toBeGreaterThan(0);
      const rechazo = await pedir(lider.page, 'PATCH', `${ruta}/${idEvento}`, { invitados: [ajeno.items[0].idUsuario] });
      expect(rechazo.status()).toBe(400);
      expect(await eventosConTitulo(maria.page, titulo), 'la lista anterior sigue vigente').toHaveLength(1);
    } finally {
      await borrarEventosConTitulo(lider.page, 'C14 invitados');
      await Promise.all([lider.contexto.close(), maria.contexto.close(), jose.contexto.close()]);
    }
  });
});

test.describe('GPI01-C14: compartir, leer lo mínimo y revocar desde ambas partes', () => {
  test('compartir deja un aviso persistido que no se repite; lo ajeno llega como «Ocupado»; un tercero no entra; cada parte revoca y el acceso se pierde', async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const titulo = marca(testInfo, 'C14 privado');
    const jose = await sesion(browser, CORREO_JOSE);
    const maria = await sesion(browser, CORREO_INVITADA);
    const tercero = await sesion(browser, CORREO_LIDER);
    try {
      const [idJose, idMaria] = [await miId(jose.page), await miId(maria.page)];
      // Punto de partida conocido, sea cual sea el resultado de una corrida anterior.
      await pedir(jose.page, 'DELETE', `${RUTA_COMPARTIDOS}/${idMaria}`);
      expect((await agenda(maria.page, idJose)).status(), 'sin relación no hay acceso').toBe(403);
      const avisosAntes = (await avisosDeCalendario(maria.page, idJose)).length;

      // Un evento de jose en un proyecto donde maria no participa.
      const idProyecto = await idDelProyecto(jose.page, PROYECTO_DE_JOSE);
      const creado = await pedir(jose.page, 'POST', `/api/proyectos/${idProyecto}/eventos`, {
        tituloEvento: titulo,
        descripcionEvento: 'Detalle reservado del equipo',
        fechaInicio: enDias(3, 15).toISOString(),
        fechaFin: enDias(3, 16).toISOString(),
        modalidad: 'VIRTUAL',
        linkSesion: 'https://meet.google.com/c14-privado',
        tipoEvento: 'REUNION',
      });
      expect(creado.status()).toBe(201);
      const { idEvento } = (await creado.json()) as { idEvento: number };

      // ── Compartir ──────────────────────────────────────────────────────
      expect((await compartir(jose.page, { idUsuario: idMaria })).status()).toBe(201);
      expect((await relaciones(jose.page)).compartidoPorMi.filter((u) => u.idUsuario === idMaria)).toHaveLength(1);
      expect((await relaciones(maria.page)).compartidosConmigo.map((u) => u.idUsuario)).toContain(idJose);
      // Un aviso persistido para la destinataria, con quién compartió. El backend no repite el
      // aviso del mismo propietario en 24 h: si ya existía uno (corrida anterior), no se duplica.
      const avisosEsperados = Math.max(1, avisosAntes);
      await expect.poll(async () => (await avisosDeCalendario(maria.page, idJose)).length, { message: 'aviso persistido' }).toBe(avisosEsperados);

      // ── Contrato mínimo de lo ajeno ────────────────────────────────────
      const respuesta = await agenda(maria.page, idJose);
      expect(respuesta.status()).toBe(200);
      const crudo = await respuesta.text();
      const item = (JSON.parse(crudo) as { eventos: Record<string, unknown>[] }).eventos.find((e) => e.idEvento === idEvento);
      expect(item, 'el evento ajeno aparece como ocupación').toBeDefined();
      expect(Object.keys(item as object).sort()).toEqual(['fechaFin', 'fechaInicio', 'idEvento', 'visibilidad']);
      expect((item as { visibilidad: string }).visibilidad).toBe('OCUPADO');
      for (const privado of [titulo, 'c14-privado', 'Detalle reservado', PROYECTO_DE_JOSE]) {
        expect(crudo, `la respuesta no filtra «${privado}»`).not.toContain(privado);
      }
      // Tampoco llega por el calendario propio de maria.
      expect(await eventosConTitulo(maria.page, titulo)).toHaveLength(0);

      // En pantalla, desde el enlace del aviso: calendario activado, bloque «Ocupado», sin título.
      await maria.page.goto(`/dashboard/calendario?compartido=${idJose}`);
      const casilla = maria.page.getByRole('checkbox', { name: 'Ver el calendario de José Ramírez' });
      await expect(casilla).toBeChecked({ timeout: 15_000 });
      await expect(maria.page).toHaveURL(/\/dashboard\/calendario$/);
      await maria.page.getByRole('radio', { name: 'Mes' }).click();
      await expect(maria.page.getByText('Ocupado').first()).toBeVisible({ timeout: 15_000 });
      await expect(maria.page.getByText(titulo)).toHaveCount(0);

      // ── Un tercero (carlos) no forma parte de la relación jose → maria ──
      expect((await agenda(tercero.page, idJose)).status()).toBe(403);
      // Revocar es idempotente y solo alcanza las filas de quien llama (el actor sale del token):
      // el tercero recibe un 200 con `eliminado: false` y no borra nada de nadie.
      for (const ruta of [`/api/usuarios/me/calendario/compartidos-conmigo/${idJose}`, `${RUTA_COMPARTIDOS}/${idMaria}`]) {
        const intento = await pedir(tercero.page, 'DELETE', ruta);
        expect(intento.status(), ruta).toBe(200);
        expect(await intento.json(), ruta).toEqual({ eliminado: false });
      }
      expect((await agenda(maria.page, idJose)).status(), 'la relación ajena sigue intacta').toBe(200);
      expect((await relaciones(tercero.page)).compartidosConmigo.map((u) => u.idUsuario)).not.toContain(idJose);

      // ── Revoca quien recibe ────────────────────────────────────────────
      const baja = await pedir(maria.page, 'DELETE', `/api/usuarios/me/calendario/compartidos-conmigo/${idJose}`);
      expect(await baja.json()).toEqual({ eliminado: true });
      expect((await agenda(maria.page, idJose)).status(), 'el acceso se pierde al instante').toBe(403);
      expect((await relaciones(jose.page)).compartidoPorMi.map((u) => u.idUsuario)).not.toContain(idMaria);

      // ── Vuelve a compartir (sin aviso nuevo) y revoca quien comparte ───
      expect((await compartir(jose.page, { idUsuario: idMaria })).status()).toBe(201);
      expect((await agenda(maria.page, idJose)).status()).toBe(200);
      expect((await avisosDeCalendario(maria.page, idJose)).length, 'compartir de nuevo no repite el aviso').toBe(avisosEsperados);
      const revocacion = await pedir(jose.page, 'DELETE', `${RUTA_COMPARTIDOS}/${idMaria}`);
      expect(await revocacion.json()).toEqual({ eliminado: true });
      expect((await agenda(maria.page, idJose)).status()).toBe(403);
      expect((await relaciones(maria.page)).compartidosConmigo.map((u) => u.idUsuario)).not.toContain(idJose);
      await maria.page.reload();
      await expect(maria.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(casilla, 'la interfaz deja de ofrecer ese calendario').toHaveCount(0);
    } finally {
      const idMaria = await miId(maria.page);
      await pedir(jose.page, 'DELETE', `${RUTA_COMPARTIDOS}/${idMaria}`);
      await borrarEventosConTitulo(jose.page, 'C14 privado');
      await Promise.all([jose.contexto.close(), maria.contexto.close(), tercero.contexto.close()]);
    }
  });
});

test.describe('GPI01-C14: sin sesión', () => {
  test('las cinco rutas de la agenda compartida responden 401', async ({ browser }) => {
    test.setTimeout(150_000);
    const anonimo = await browser.newContext();
    try {
      const page = await anonimo.newPage();
      expect((await compartir(page, { idUsuario: 1 })).status(), 'POST compartidos').toBe(401);
      for (const [metodo, ruta] of [
        ['GET', RUTA_COMPARTIDOS],
        ['DELETE', `${RUTA_COMPARTIDOS}/1`],
        ['DELETE', '/api/usuarios/me/calendario/compartidos-conmigo/1'],
        ['GET', `/api/usuarios/me/calendario/compartidos-conmigo/1/agenda?${rango()}`],
      ] as const) {
        expect((await pedir(page, metodo, ruta)).status(), `${metodo} ${ruta}`).toBe(401);
      }
    } finally {
      await anonimo.close();
    }
  });
});
