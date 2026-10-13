import type { APIResponse, Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login, loginFallido } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * FG05-C02 (T-310): datos, filtros, paginación y detalle del visor de eventos
 * de seguridad, de punta a punta contra la pila aislada.
 *
 * Los eventos no se insertan en la base: los produce la aplicación real y los
 * escribe su writer (`SecurityEventsService.record`):
 *   - USER_STATUS_CHANGED: el administrador cambia 22 veces el estado de una
 *     cuenta sintética por `PATCH /admin/usuarios/:id/estado` (queda ACTIVA).
 *   - LOGIN_FAILED: un inicio de sesión con contraseña errónea contra esa
 *     cuenta y otro contra una cuenta que no existe.
 * La suite no toca la base directamente y solo lee la bitácora.
 */

test.describe.configure({ mode: 'serial' });

const ADMIN = 'admin@uvg.edu.gt';
const CUENTA = 'tomas.guerrero@uvg.edu.gt';
const RUTA = '/dashboard/admin/seguridad';
const API = `${API_URL}/api`;
const CAMBIOS = 22;

let page: Page;
let idCuenta = 0;
let idAdmin = 0;
/** Instante en que empezó esta ejecución: acota por la API los eventos que ella misma generó. */
let inicio = '';
/** Eventos de la cuenta que ya había antes (ejecuciones anteriores sobre la misma pila). */
const previos = { cambios: 0, fallidos: 0 };

/** Día de hoy en el calendario de Guatemala (`AAAA-MM-DD`), como lo escribe el filtro de fecha. */
const diaGuatemala = (desplazamientoDias = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(Date.now() + desplazamientoDias * 86_400_000));

/** El backend limita peticiones por IP: ante un 429 se espera y se repite, nunca se toca el límite. */
async function conReintento(pedir: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await pedir();
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

const eventos = async (consulta: string) => {
  const respuesta = await conReintento(() => page.request.get(`${API}/admin/eventos-seguridad?${consulta}`));
  expect(respuesta.status(), consulta).toBe(200);
  return respuesta.json();
};

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const nueva = await (await browser.newContext()).newPage();
  await desactivarTour(nueva);
  // El login lleva a administración a su panel; `login` espera esa ruta exacta.
  await login(nueva, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  return nueva;
}

async function abrirVisor() {
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Eventos de seguridad/ })).toBeVisible();
}

const tabla = () => page.getByRole('table', { name: /Eventos de seguridad/ });
const filas = () => tabla().locator('tbody tr');
/** Espera la respuesta de la API que corresponde a un cambio de filtro o de página. */
const trasConsulta = (contiene: string, accion: () => Promise<unknown>) =>
  Promise.all([
    page.waitForResponse((r) => r.url().startsWith(`${API}/admin/eventos-seguridad`) && r.url().includes(contiene) && r.status() === 200),
    accion(),
  ]).then(([respuesta]) => respuesta.json());

test.beforeAll(async ({ browser }) => {
  // Incluye el margen para esperar la ventana del límite de inicios de sesión.
  test.setTimeout(420_000);
  page = await sesion(browser, ADMIN);
  await page.setViewportSize({ width: 1440, height: 900 });

  const busqueda = await conReintento(() => page.request.get(`${API}/admin/usuarios?search=${encodeURIComponent(CUENTA)}`));
  expect(busqueda.status()).toBe(200);
  const cuenta = (await busqueda.json()).data.find((usuario: { correo: string }) => usuario.correo === CUENTA);
  expect(cuenta, 'la cuenta sintética existe en la pila').toBeTruthy();
  idCuenta = cuenta.idUsuario;
  idAdmin = (await (await page.request.get(`${API}/usuarios/me`)).json()).idUsuario;
  expect(idAdmin).toBeGreaterThan(0);

  previos.cambios = (await eventos(`tipo=USER_STATUS_CHANGED&idUsuario=${idCuenta}&limit=1`)).total;
  previos.fallidos = (await eventos(`tipo=LOGIN_FAILED&idUsuario=${idCuenta}&limit=1`)).total;
  inicio = new Date().toISOString();

  // Inicios de sesión fallidos reales: uno contra la cuenta y otro contra una cuenta inexistente.
  const anonimo = await browser.newContext();
  // El correo inexistente es único por ejecución, para no acumular intentos sobre la misma referencia.
  for (const correo of [CUENTA, `no-existe-fg05-${Date.now()}@uvg.edu.gt`]) {
    expect(await loginFallido(anonimo.request, API_URL, correo), correo).toBe(401);
  }
  await anonimo.close();

  // 22 cambios de estado reales. Número par y último = ACTIVO: la cuenta termina como empezó.
  const estados = ['INACTIVO', 'ACTIVO', 'BLOQUEADO', 'ACTIVO'];
  for (let i = 0; i < CAMBIOS; i += 1) {
    const estado = i === CAMBIOS - 1 ? 'ACTIVO' : estados[i % estados.length];
    const cambio = await conReintento(() => page.request.patch(`${API}/admin/usuarios/${idCuenta}/estado`, { data: { estado } }));
    expect(cambio.status(), `cambio ${i + 1} a ${estado}`).toBe(200);
    await page.waitForTimeout(120);
  }
});

test.afterAll(async () => {
  // Pase lo que pase, la cuenta sintética queda ACTIVA.
  if (idCuenta) {
    await conReintento(() => page.request.patch(`${API}/admin/usuarios/${idCuenta}/estado`, { data: { estado: 'ACTIVO' } }));
  }
  await page?.context().close();
});

test.describe('FG05-C02: eventos reales en el visor', () => {
  test('la API entrega los eventos generados, saneados y en orden descendente estable', async () => {
    const cuerpo = await eventos(`tipo=USER_STATUS_CHANGED&idUsuario=${idCuenta}&desde=${encodeURIComponent(inicio)}&limit=50`);
    expect(cuerpo.total).toBe(CAMBIOS);
    expect(cuerpo.data).toHaveLength(CAMBIOS);
    const ids = cuerpo.data.map((evento: { id: number }) => evento.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    for (const evento of cuerpo.data) {
      expect(Object.keys(evento).sort()).toEqual(['actor', 'cuenta', 'detalle', 'fecha', 'id', 'origen', 'tipo']);
      expect(evento.actor).toEqual({ idUsuario: idAdmin, nombre: expect.any(String) });
      expect(evento.cuenta).toEqual({ idUsuario: idCuenta, nombre: 'Tomás Guerrero' });
      expect(Object.keys(evento.detalle).sort()).toEqual(['estadoAnterior', 'estadoNuevo']);
      expect(evento.origen.ipConfiable).toBe(false);
    }
    // El más reciente es el que dejó la cuenta activa.
    expect(cuerpo.data[0].detalle.estadoNuevo).toBe('ACTIVO');
    expect(JSON.stringify(cuerpo)).not.toMatch(/@uvg\.edu\.gt|detalleJson|Incorrecta-123|ipTrusted/);
  });

  test('filtros de tipo y de usuario combinados: todas las páginas, sin saltos ni repeticiones', async () => {
    const total = previos.cambios + CAMBIOS;
    const paginas = Math.ceil(total / 20);
    expect(paginas).toBeGreaterThanOrEqual(2);

    await abrirVisor();
    await trasConsulta(`idUsuario=${idCuenta}`, () => page.getByLabel('ID de usuario').fill(String(idCuenta)));
    const primera = await trasConsulta('tipo=USER_STATUS_CHANGED', async () => {
      await page.getByRole('combobox', { name: 'Tipo de evento' }).click();
      await page.getByRole('option', { name: 'Cambio de estado de cuenta' }).click();
    });

    expect(primera).toMatchObject({ total, page: 1, totalPages: paginas });
    await expect(page.getByText('Eventos encontrados:')).toContainText(String(total));
    await expect(filas()).toHaveCount(20);
    await expect(tabla().locator('[data-slot="tag"]').filter({ hasNotText: 'Cambio de estado de cuenta' })).toHaveCount(0);
    const paginador = page.getByRole('navigation', { name: 'Paginación de eventos de seguridad' });
    await expect(paginador.getByText(`Página 1 de ${paginas}`)).toBeVisible();
    await expect(paginador.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    const recibidos = [...primera.data];
    for (let n = 2; n <= paginas; n += 1) {
      const siguiente = await trasConsulta(`page=${n}`, () => paginador.getByRole('button', { name: 'Página siguiente' }).click());
      await expect(paginador.getByText(`Página ${n} de ${paginas}`)).toBeVisible();
      await expect(filas()).toHaveCount(n === paginas ? total - 20 * (paginas - 1) : 20);
      recibidos.push(...siguiente.data);
    }
    await expect(paginador.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();

    const ids = recibidos.map((evento: { id: number }) => evento.id);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  test('cambiar un filtro desde la última página vuelve a la página 1', async () => {
    const cuerpo = await trasConsulta('tipo=LOGIN_FAILED', async () => {
      await page.getByRole('combobox', { name: 'Tipo de evento' }).click();
      await page.getByRole('option', { name: 'Inicio de sesión fallido' }).click();
    });
    expect(cuerpo.page).toBe(1);
    // Un inicio de sesión fallido más contra la cuenta sintética, identificada por nombre e ID.
    expect(cuerpo.total).toBe(previos.fallidos + 1);
    await expect(filas()).toHaveCount(Math.min(20, previos.fallidos + 1));
    await expect(tabla().getByText(`Tomás Guerrero (ID ${idCuenta})`).locator('visible=true').first()).toBeVisible();
    // Tras varias ejecuciones seguidas la cuenta puede estar en bloqueo temporal: ambos motivos son reales.
    await expect(tabla().getByText(/Credenciales incorrectas|Cuenta en bloqueo temporal/).locator('visible=true').first()).toBeVisible();
  });

  test('filtro por actor: el administrador aparece como quien ejecutó los cambios', async () => {
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page.getByLabel('ID de usuario')).toHaveValue('');
    await trasConsulta(`idUsuario=${idAdmin}`, () => page.getByLabel('ID de usuario').fill(String(idAdmin)));
    const cuerpo = await eventos(`idUsuario=${idAdmin}&tipo=USER_STATUS_CHANGED&limit=50`);
    expect(cuerpo.total).toBeGreaterThanOrEqual(CAMBIOS);
    expect(cuerpo.data.every((evento: { actor: { idUsuario: number } }) => evento.actor.idUsuario === idAdmin)).toBe(true);
    await expect(filas().first()).toBeVisible();
  });

  test('filtro por fecha: hoy (día de Guatemala) los incluye y mañana no encuentra ninguno', async () => {
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    const hoy = diaGuatemala();
    await trasConsulta('desde=', () => page.getByLabel('Desde').fill(hoy));
    const deHoy = await trasConsulta('hasta=', () => page.getByLabel('Hasta').fill(hoy));
    expect(deHoy.total).toBeGreaterThanOrEqual(CAMBIOS + 2);

    const manana = diaGuatemala(1);
    // Primero «Hasta», para no pasar por un rango invertido.
    await trasConsulta(`hasta=${manana}`, () => page.getByLabel('Hasta').fill(manana));
    const vacio = await trasConsulta(`desde=${manana}`, () => page.getByLabel('Desde').fill(manana));
    expect(vacio).toMatchObject({ total: 0, data: [] });
    await expect(page.getByText('Ningún evento coincide con estos filtros.')).toBeVisible();
    await expect(tabla()).toHaveCount(0);

    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(tabla()).toBeVisible();
  });

  test('un rango invertido se señala en el campo y no consulta la API', async () => {
    // La prueba anterior dejó los filtros vacíos.
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
    // Esta consulta ya está en caché desde la prueba anterior: puede no salir a la red.
    await page.getByLabel('Desde').fill(diaGuatemala());
    await expect(tabla()).toBeVisible();
    await expect(page.getByText('Eventos encontrados:')).toBeVisible();
    let consultas = 0;
    const contar = (r: { url: () => string }) => {
      if (r.url().startsWith(`${API}/admin/eventos-seguridad`)) consultas += 1;
    };
    page.on('request', contar);
    await page.getByLabel('Hasta').fill(diaGuatemala(-1));
    await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();
    await expect(page.getByLabel('Hasta')).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(500);
    page.off('request', contar);
    expect(consultas).toBe(0);
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  });

  test('el detalle muestra la transición real, sin JSON crudo, y Escape devuelve el foco', async () => {
    // Consulta ya vista en esta sesión: puede servirse de la caché, sin salir a la red.
    await page.getByLabel('ID de usuario').fill(String(idCuenta));
    const boton = page.getByRole('button', { name: /^Ver detalle: Cambio de estado de cuenta/ }).first();
    await expect(boton).toBeVisible();
    await boton.click();
    const dialogo = page.getByRole('dialog', { name: 'Detalle del evento de seguridad' });
    await expect(dialogo).toBeVisible();

    const valor = (termino: string) => dialogo.locator('dt', { hasText: new RegExp(`^${termino}$`) }).locator('xpath=following-sibling::dd[1]');
    await expect(valor('Actor')).toContainText(`(ID ${idAdmin})`);
    await expect(valor('Cuenta afectada')).toHaveText(`Tomás Guerrero (ID ${idCuenta})`);
    await expect(valor('Estado nuevo')).toHaveText('Activo');
    await expect(valor('Estado anterior')).toHaveText(/^(Inactivo|Bloqueado)$/);
    await expect(valor('Origen')).toContainText('IP no verificada');
    expect(await dialogo.innerText()).not.toMatch(/@uvg\.edu\.gt|\{"|estadoNuevo|detalleJson|null|undefined/);

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(boton).toBeFocused();
  });

  for (const [ancho, alto] of [
    [375, 800],
    [1440, 900],
  ]) {
    test(`con 20 filas reales a ${ancho} px no hay desborde ni botones fuera de la ventana, en claro y oscuro`, async () => {
      for (const oscuro of [false, true]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await abrirVisor();
        if ((await page.evaluate(() => document.documentElement.classList.contains('dark'))) !== oscuro) {
          await page.getByRole('button', { name: 'Cambiar tema' }).first().click();
          await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(oscuro);
        }
        await page.setViewportSize({ width: ancho, height: alto });
        await abrirVisor();
        await expect(filas()).toHaveCount(20);
        const medida = await page.evaluate(() => {
          const anchoVentana = document.documentElement.clientWidth;
          const botones = [...document.querySelectorAll<HTMLElement>('main table button, main nav button')];
          return {
            desborde: document.documentElement.scrollWidth - anchoVentana,
            fuera: botones.filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && (r.right > anchoVentana + 1 || r.left < -1);
            }).length,
            recortadas: [...document.querySelectorAll<HTMLElement>('main [data-slot="tag"]')].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
            botones: botones.length,
          };
        });
        expect(medida, `${ancho}px ${oscuro ? 'oscuro' : 'claro'}`).toMatchObject({ desborde: 0, fuera: 0, recortadas: 0 });
        expect(medida.botones).toBeGreaterThanOrEqual(22);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) {
        await page.getByRole('button', { name: 'Cambiar tema' }).first().click();
      }
    });
  }

  test('la cuenta sintética termina activa y la suite no dejó eventos fuera del catálogo', async () => {
    const usuarios = await conReintento(() => page.request.get(`${API}/admin/usuarios?search=${encodeURIComponent(CUENTA)}`));
    const cuenta = (await usuarios.json()).data.find((usuario: { correo: string }) => usuario.correo === CUENTA);
    expect(cuenta.estado).toBe('ACTIVO');

    const todo = await eventos('limit=50');
    expect(todo.tipos).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCEEDED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_COMPLETED', 'USER_STATUS_CHANGED']);
    expect(todo.data.every((evento: { tipo: string }) => todo.tipos.includes(evento.tipo))).toBe(true);
  });
});
