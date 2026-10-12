import type { APIResponse, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import {
  CORREO_INVITADA,
  CORREO_LIDER,
  LINK,
  PROYECTO,
  abrirNuevoEvento,
  borrarEventosConTitulo,
  capturar,
  crearEventoPorApi,
  enDias,
  eventosConTitulo,
  fijarRelojMananaTemprano,
  idDelProyecto,
  marca,
} from './support/calendario';

/**
 * GPI01-C13: ciclo de vida del evento contra servicios reales y aislados
 * (scripts/e2e/isolated-stack.sh). Cada mutación se comprueba dos veces: en la
 * API real (lo que quedó en PostgreSQL) y en la interfaz tras RECARGAR la
 * página, en las tres vistas. Nada de la API se simula.
 *
 * Complementa calendario-eventos.spec.ts (formulario y modalidades) con lo que
 * faltaba certificar: persistencia entre recargas en Día/Semana/Mes, solapes
 * legítimos y el contrato real de errores 400/401/403/404/409.
 */

// maria.lopez (seed): integrante del Proyecto 1 sin liderarlo y líder de un
// proyecto PUBLICADO y de uno CERRADO.
const PROYECTO_DE_MARIA = 'App de Monitoreo Ambiental';
const PROYECTO_CERRADO_DE_MARIA = 'Feria de Ciencias UVG 2026';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Petición a la API real con la sesión de la página; un 429 del limitador se espera y se repite. */
async function pedir(page: Page, method: Metodo, ruta: string, data?: unknown): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.fetch(ruta, { method, data });
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

const cuerpoEvento = (titulo: string, inicio: Date, fin: Date) => ({
  tituloEvento: titulo,
  fechaInicio: inicio.toISOString(),
  fechaFin: fin.toISOString(),
  modalidad: 'VIRTUAL',
  linkSesion: LINK,
  tipoEvento: 'REUNION',
});

const bloque = (page: Page, titulo: string, horas: string) =>
  page.getByRole('button', { name: new RegExp(`^${titulo}, ${horas}`) });

async function vista(page: Page, nombre: 'Día' | 'Semana' | 'Mes') {
  await page.getByRole('radio', { name: nombre }).click();
  await expect(page.getByRole('radio', { name: nombre })).toBeChecked();
}

async function idDe(page: Page, tituloProyecto: string): Promise<number> {
  return idDelProyecto(page, tituloProyecto);
}

test.describe('GPI01-C13: persistencia del evento en las tres vistas', () => {
  let titulo: string;

  test.beforeEach(async ({ page }, testInfo) => {
    titulo = marca(testInfo, 'C13 ciclo');
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
  });

  test.afterEach(async ({ page }) => {
    await borrarEventosConTitulo(page, 'C13 ciclo');
  });

  test('crear, editar y eliminar desde la interfaz queda en la base y se ve en Día, Semana y Mes tras recargar', async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    // ── Crear ──────────────────────────────────────────────────────────
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    const creados = await eventosConTitulo(page, titulo);
    expect(creados, 'un solo evento persistido').toHaveLength(1);
    const [creado] = creados;
    expect(creado).toMatchObject({ tituloEvento: titulo, modalidad: 'VIRTUAL', linkSesion: LINK });
    expect(new Date(creado.fechaFin).getTime() - new Date(creado.fechaInicio).getTime()).toBe(3_600_000);

    // Persistencia real: una recarga completa vuelve a leerlo del servidor.
    await page.reload();
    await vista(page, 'Día');
    await expect(bloque(page, titulo, '09:00 a 10:00')).toBeVisible({ timeout: 15_000 });
    await vista(page, 'Semana');
    await expect(bloque(page, titulo, '09:00 a 10:00')).toBeVisible();
    await vista(page, 'Mes');
    await expect(page.getByText(titulo).first()).toBeVisible();
    await capturar(page, testInfo, 'c13-evento-en-mes');

    // ── Editar: nuevo título y nuevo horario ───────────────────────────
    const editado = `${titulo} movido`;
    await vista(page, 'Día');
    await bloque(page, titulo, '09:00 a 10:00').click();
    await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await edicion.getByLabel('Título del evento o actividad').fill(editado);
    await edicion.getByLabel('Hora de inicio').fill('11:00');
    await edicion.getByLabel('Hora de fin').fill('12:30');
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();

    const trasEditar = await eventosConTitulo(page, titulo);
    expect(trasEditar, 'sigue siendo un solo registro').toHaveLength(1);
    expect(trasEditar[0].idEvento, 'se actualizó, no se duplicó').toBe(creado.idEvento);
    expect(trasEditar[0].tituloEvento).toBe(editado);
    expect(new Date(trasEditar[0].fechaFin).getTime() - new Date(trasEditar[0].fechaInicio).getTime()).toBe(5_400_000);

    await page.reload();
    await vista(page, 'Día');
    await expect(bloque(page, editado, '11:00 a 12:30')).toBeVisible({ timeout: 15_000 });
    await expect(bloque(page, titulo, '09:00 a 10:00')).toHaveCount(0);
    await vista(page, 'Semana');
    await expect(bloque(page, editado, '11:00 a 12:30')).toBeVisible();
    await capturar(page, testInfo, 'c13-evento-editado-semana');

    // ── Eliminar ───────────────────────────────────────────────────────
    await vista(page, 'Día');
    await bloque(page, editado, '11:00 a 12:30').click();
    await page.getByRole('dialog', { name: editado }).getByRole('button', { name: 'Editar evento' }).click();
    await edicion.getByRole('button', { name: 'Eliminar evento' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
    await expect(page.getByText('Evento eliminado')).toBeVisible();

    expect(await eventosConTitulo(page, titulo), 'no queda nada en la base').toHaveLength(0);
    const idProyecto = await idDe(page, PROYECTO);
    expect((await pedir(page, 'DELETE', `/api/proyectos/${idProyecto}/eventos/${creado.idEvento}`)).status(), 'el registro ya no existe').toBe(404);

    await page.reload();
    for (const nombre of ['Día', 'Semana', 'Mes'] as const) {
      await vista(page, nombre);
      await expect(page.getByText(editado), `sin restos en ${nombre}`).toHaveCount(0);
    }
  });

  test('dos eventos que se solapan en el mismo proyecto son legítimos: ambos persisten y se ven', async ({ page }) => {
    const idProyecto = await idDe(page, PROYECTO);
    const a = await crearEventoPorApi(page, idProyecto, { tituloEvento: `${titulo} A`, fechaInicio: enDias(0, 14), fechaFin: enDias(0, 15) });
    const b = await crearEventoPorApi(page, idProyecto, { tituloEvento: `${titulo} B`, fechaInicio: enDias(0, 14, 30), fechaFin: enDias(0, 15, 30) });
    expect(a).not.toBe(b);
    expect(await eventosConTitulo(page, titulo)).toHaveLength(2);

    await page.goto('/dashboard/calendario');
    await vista(page, 'Día');
    await expect(bloque(page, `${titulo} A`, '14:00 a 15:00')).toBeVisible({ timeout: 15_000 });
    await expect(bloque(page, `${titulo} B`, '14:30 a 15:30')).toBeVisible();
  });
});

test.describe('GPI01-C13: contrato real de errores de eventos', () => {
  let titulo: string;

  test.beforeEach(async ({ page }, testInfo) => {
    titulo = marca(testInfo, 'C13 error');
    await fijarRelojMananaTemprano(page);
  });

  test('400 por fechas inválidas y 404 por proyecto o evento inexistente; nada se persiste', async ({ page }) => {
    await login(page, CORREO_LIDER);
    const idProyecto = await idDe(page, PROYECTO);

    const finAntes = await pedir(page, 'POST', `/api/proyectos/${idProyecto}/eventos`, cuerpoEvento(titulo, enDias(0, 12), enDias(0, 11)));
    expect(finAntes.status()).toBe(400);
    const sinTitulo = await pedir(page, 'POST', `/api/proyectos/${idProyecto}/eventos`, { ...cuerpoEvento(titulo, enDias(0, 12), enDias(0, 13)), tituloEvento: '' });
    expect(sinTitulo.status()).toBe(400);

    expect((await pedir(page, 'POST', '/api/proyectos/2147483000/eventos', cuerpoEvento(titulo, enDias(0, 12), enDias(0, 13)))).status()).toBe(404);
    expect((await pedir(page, 'PATCH', `/api/proyectos/${idProyecto}/eventos/2147483000`, { tituloEvento: titulo })).status()).toBe(404);
    expect((await pedir(page, 'DELETE', `/api/proyectos/${idProyecto}/eventos/2147483000`)).status()).toBe(404);

    expect(await eventosConTitulo(page, titulo)).toHaveLength(0);
  });

  test('403: un integrante que no lidera no puede crear, editar ni eliminar eventos del proyecto', async ({ page, browser }) => {
    const lider = await browser.newContext();
    try {
      const pageLider = await lider.newPage();
      await login(pageLider, CORREO_LIDER);
      const idProyecto = await idDe(pageLider, PROYECTO);
      const idEvento = await crearEventoPorApi(pageLider, idProyecto, { tituloEvento: titulo, fechaInicio: enDias(1, 9), fechaFin: enDias(1, 10) });

      await login(page, CORREO_INVITADA);
      const crear = await pedir(page, 'POST', `/api/proyectos/${idProyecto}/eventos`, cuerpoEvento(`${titulo} intruso`, enDias(1, 12), enDias(1, 13)));
      expect(crear.status()).toBe(403);
      expect((await pedir(page, 'PATCH', `/api/proyectos/${idProyecto}/eventos/${idEvento}`, { tituloEvento: `${titulo} alterado` })).status()).toBe(403);
      expect((await pedir(page, 'DELETE', `/api/proyectos/${idProyecto}/eventos/${idEvento}`)).status()).toBe(403);

      // El evento del líder sigue intacto y no apareció ninguno del integrante.
      const persistidos = await eventosConTitulo(pageLider, titulo);
      expect(persistidos.map((e) => e.tituloEvento)).toEqual([titulo]);
      expect(persistidos[0].idEvento).toBe(idEvento);
    } finally {
      const limpieza = await lider.newPage();
      await login(limpieza, CORREO_LIDER);
      await borrarEventosConTitulo(limpieza, 'C13 error');
      await lider.close();
    }
  });

  test('409: el líder de un proyecto cerrado no puede agendar en él, ni por la API ni desde la interfaz', async ({ page }) => {
    await login(page, CORREO_INVITADA);
    const idCerrado = await idDe(page, PROYECTO_CERRADO_DE_MARIA);

    const rechazo = await pedir(page, 'POST', `/api/proyectos/${idCerrado}/eventos`, cuerpoEvento(titulo, enDias(0, 12), enDias(0, 13)));
    expect(rechazo.status()).toBe(409);
    expect(((await rechazo.json()) as { message: string }).message).toBe('No se puede crear un evento en un proyecto cerrado');
    expect(await eventosConTitulo(page, titulo)).toHaveLength(0);

    // La interfaz no invita a intentarlo: el proyecto cerrado está deshabilitado y marcado.
    await page.goto('/dashboard/calendario');
    await page.getByRole('button', { name: 'Agendar actividad' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
    const selector = dialogo.getByLabel('Proyecto', { exact: true });
    await expect(selector).not.toContainText(PROYECTO_CERRADO_DE_MARIA);
    await selector.click();
    const cerrado = page.getByRole('option', { name: `${PROYECTO_CERRADO_DE_MARIA} · Cerrado` });
    await expect(cerrado).toBeVisible();
    await expect(cerrado).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('option', { name: PROYECTO_DE_MARIA, exact: true })).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });

  test('en un proyecto abierto que sí lidera, la misma cuenta agenda desde la interfaz y queda persistido', async ({ page }) => {
    await login(page, CORREO_INVITADA);
    try {
      const dialogo = await abrirNuevoEvento(page, PROYECTO_DE_MARIA);
      await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
      await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
      await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
      await expect(page.getByText('Evento agendado')).toBeVisible();

      const persistidos = await eventosConTitulo(page, titulo);
      expect(persistidos).toHaveLength(1);
      expect(persistidos[0].idProyecto).toBe(await idDe(page, PROYECTO_DE_MARIA));
    } finally {
      await borrarEventosConTitulo(page, 'C13 error');
    }
  });

  test('401: sin sesión no se puede leer ni escribir eventos', async ({ browser }) => {
    const anonimo = await browser.newContext();
    try {
      const page = await anonimo.newPage();
      expect((await pedir(page, 'GET', '/api/usuarios/me/eventos')).status()).toBe(401);
      expect((await pedir(page, 'POST', '/api/proyectos/1/eventos', cuerpoEvento(titulo, enDias(0, 12), enDias(0, 13)))).status()).toBe(401);
      expect((await pedir(page, 'DELETE', '/api/proyectos/1/eventos/1')).status()).toBe(401);
    } finally {
      await anonimo.close();
    }
  });
});
