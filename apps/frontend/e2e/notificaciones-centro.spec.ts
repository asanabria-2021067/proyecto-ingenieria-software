import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { marca } from './support/calendario';
import { desactivarTour, noLeidas } from './support/realtime';
import { crearTareas, eliminarTareas, idProyectoPorTitulo, pedir, PROYECTO_TUTORIAS, type TareaCreada } from './support/kanban';

/**
 * T-372 (HU-198): pruebas E2E del centro de notificaciones contra la pila real.
 * Filtrar, abrir un aviso y marcar todas como leídas.
 *
 * Los avisos de cada prueba salen de un flujo real: carlos.mendoza (líder de
 * Tutorías) crea tareas con un título único por corrida y se las asigna a
 * otra cuenta, lo que genera `TAREA_ASIGNADA` con ese título en el mensaje.
 * La búsqueda por esa marca aísla exactamente lo que la prueba creó, sin
 * depender de los avisos del seed ni de su orden. Las tareas se eliminan al
 * terminar; los avisos no tienen endpoint de borrado y quedan en la base.
 *
 * Serial: «marcar todas» lee TODOS los avisos de María, y en paralelo dejaría
 * sin pendientes a los otros escenarios.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const MARIA = 'maria.lopez@uvg.edu.gt';
// Otra integrante de Tutorías: sus avisos no entran en el «marcar todas» de María.
const JOSE = 'jose.ramirez@uvg.edu.gt';

interface Aviso {
  idNotificacion: number;
  tituloNotificacion: string;
  mensajeNotificacion: string | null;
  tipoNotificacion: string;
  leidaEn: string | null;
}

interface Sesion {
  contexto: BrowserContext;
  page: Page;
  /** Errores no capturados de la página: cada escenario termina exigiendo que no haya ninguno. */
  errores: string[];
}

async function sesion(browser: Browser, correo: string): Promise<Sesion> {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  const errores: string[] = [];
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 200)));
  await desactivarTour(page);
  await login(page, correo);
  return { contexto, page, errores };
}

/** Avisos propios cuyo título o mensaje contiene `texto`, leídos de la API real con la sesión de `page`. */
async function avisosCon(page: Page, texto: string): Promise<Aviso[]> {
  const respuesta = await pedir(page, 'GET', `/api/notificaciones?page=1&limit=50&q=${encodeURIComponent(texto)}`);
  expect(respuesta.status(), `GET /notificaciones: ${await respuesta.text()}`).toBe(200);
  return ((await respuesta.json()) as { data: Aviso[] }).data;
}

/** Espera a que la asignación haya generado `cantidad` avisos con la marca para la cuenta de `page`. */
async function esperarAvisos(page: Page, texto: string, cantidad: number): Promise<Aviso[]> {
  let avisos: Aviso[] = [];
  await expect
    .poll(async () => (avisos = await avisosCon(page, texto)).length, { message: `avisos con «${texto}»`, timeout: 20_000 })
    .toBe(cantidad);
  return avisos;
}

/** Preparación: lee un aviso por la API real (mismo PATCH que usa la interfaz), reintentando solo los 429. */
async function leerPorApi(page: Page, idNotificacion: number): Promise<void> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.patch(`/api/notificaciones/${idNotificacion}/leer`);
    if (respuesta.status() !== 429 || intento >= 12) {
      expect(respuesta.status(), `PATCH /notificaciones/${idNotificacion}/leer`).toBe(200);
      return;
    }
    await page.waitForTimeout(1_100);
  }
}

async function idIntegrante(page: Page, idProyecto: number, correo: string): Promise<number> {
  const respuesta = await pedir(page, 'GET', `/api/proyectos/${idProyecto}/equipo`);
  expect(respuesta.status()).toBe(200);
  const equipo = (await respuesta.json()) as { usuario: { idUsuario: number; correo: string } }[];
  const integrante = equipo.find((m) => m.usuario.correo === correo);
  if (!integrante) throw new Error(`${correo} no integra «${PROYECTO_TUTORIAS}» en el seed`);
  return integrante.usuario.idUsuario;
}

/** Crea una tarea por título y la asigna: la asignación real es la que notifica (`TAREA_ASIGNADA`). */
async function asignarTareas(lider: Page, idProyecto: number, asignaciones: { titulo: string; idUsuario: number }[]): Promise<TareaCreada[]> {
  const tareas = await crearTareas(lider, idProyecto, asignaciones.map((a) => ({ tituloTarea: a.titulo, prioridad: 'MEDIA' as const })));
  for (const [i, tarea] of tareas.entries()) {
    const respuesta = await pedir(lider, 'POST', `/api/proyectos/${idProyecto}/tareas/${tarea.idTarea}/asignar`, { idUsuario: asignaciones[i].idUsuario });
    expect(respuesta.status(), `asignar «${tarea.tituloTarea}»: ${await respuesta.text()}`).toBe(200);
  }
  return tareas;
}

const bandeja = (page: Page) => page.getByRole('region', { name: 'Bandeja de entrada' });
const fila = (page: Page, id: number) => bandeja(page).locator(`li[data-notificacion="${id}"]`);

/** Ids de las filas visibles, ordenados: el resultado real de la lista, no la petición que lo pidió. */
async function idsVisibles(page: Page): Promise<number[]> {
  const ids = await bandeja(page).locator('li[data-notificacion]').evaluateAll((filas) => filas.map((f) => Number(f.getAttribute('data-notificacion'))));
  return ids.sort((a, b) => a - b);
}

const ordenados = (...avisos: Aviso[]) => avisos.map((a) => a.idNotificacion).sort((a, b) => a - b);

async function abrirCentro(page: Page): Promise<void> {
  await page.goto('/dashboard/notificaciones');
  await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();
  // La lista y los conteos llegan en paralelo: más margen que el default.
  await expect(bandeja(page).getByText(/\d+ avisos? · \d+ sin leer/)).toBeVisible({ timeout: 20_000 });
}

async function buscar(page: Page, texto: string): Promise<void> {
  await bandeja(page).getByRole('textbox', { name: 'Buscar notificaciones por título o contenido' }).fill(texto);
}

test('A · filtrar: la búsqueda, la lectura y la categoría acotan la lista a lo que cumple el criterio', async ({ browser }, testInfo) => {
  const etiqueta = marca(testInfo, 'T372 filtro');
  const lider = await sesion(browser, CARLOS);
  const maria = await sesion(browser, MARIA);
  const idProyecto = await idProyectoPorTitulo(lider.page, PROYECTO_TUTORIAS);
  let tareas: TareaCreada[] = [];
  try {
    const idMaria = await idIntegrante(lider.page, idProyecto, MARIA);
    tareas = await asignarTareas(lider.page, idProyecto, [
      { titulo: `${etiqueta} pendiente`, idUsuario: idMaria },
      { titulo: `${etiqueta} revisada`, idUsuario: idMaria },
    ]);
    const avisos = await esperarAvisos(maria.page, etiqueta, 2);
    const pendiente = avisos.find((a) => a.mensajeNotificacion?.includes(`${etiqueta} pendiente`))!;
    const revisada = avisos.find((a) => a.mensajeNotificacion?.includes(`${etiqueta} revisada`))!;
    expect(pendiente, 'aviso de la tarea «pendiente»').toBeDefined();
    expect(revisada, 'aviso de la tarea «revisada»').toBeDefined();
    await leerPorApi(maria.page, revisada.idNotificacion);

    const page = maria.page;
    await abrirCentro(page);
    await buscar(page, etiqueta);
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(pendiente, revisada));
    await expect(bandeja(page).getByText('2 avisos · 1 sin leer')).toBeVisible();
    await expect(fila(page, pendiente.idNotificacion)).toHaveAttribute('data-leida', 'false');
    await expect(fila(page, revisada.idNotificacion)).toHaveAttribute('data-leida', 'true');

    // «No leídas»: queda solo la pendiente y ninguna fila visible está leída.
    const lectura = bandeja(page);
    await lectura.getByRole('radio', { name: 'No leídas' }).click();
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(pendiente));
    await expect(bandeja(page).locator('li[data-leida="true"]')).toHaveCount(0);

    // «Leídas»: queda solo la revisada y ninguna fila visible está sin leer.
    await lectura.getByRole('radio', { name: 'Leídas', exact: true }).click();
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(revisada));
    await expect(bandeja(page).locator('li[data-leida="false"]')).toHaveCount(0);

    await lectura.getByRole('radio', { name: 'Todas' }).click();
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(pendiente, revisada));

    // Categoría que abarca TAREA_ASIGNADA: siguen las dos, cada una con su categoría.
    const categoria = bandeja(page).getByRole('combobox', { name: 'Filtrar por categoría' });
    await categoria.click();
    await page.getByRole('option', { name: 'Tareas e hitos' }).click();
    await expect(categoria).toHaveText('Tareas e hitos');
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(pendiente, revisada));
    for (const aviso of [pendiente, revisada]) {
      await expect(fila(page, aviso.idNotificacion).getByText('Tareas e hitos', { exact: true })).toBeVisible();
    }

    // Otra categoría: los avisos de tarea no cumplen el criterio y no aparecen.
    await categoria.click();
    await page.getByRole('option', { name: 'Recordatorios y calendario' }).click();
    await expect(categoria).toHaveText('Recordatorios y calendario');
    await expect(bandeja(page).getByText('Sin resultados')).toBeVisible();
    await expect(bandeja(page).locator('li[data-notificacion]')).toHaveCount(0);
    await expect(bandeja(page).getByText('0 avisos · 0 sin leer')).toBeVisible();
    expect(maria.errores, 'errores de página al filtrar').toEqual([]);
  } finally {
    await eliminarTareas(lider.page, idProyecto, tareas);
    await Promise.all([lider.contexto.close(), maria.contexto.close()]);
  }
});

test('B · abrir: el visor muestra el aviso elegido y abrirlo lo marca como leído', async ({ browser }, testInfo) => {
  const etiqueta = marca(testInfo, 'T372 abrir');
  const lider = await sesion(browser, CARLOS);
  const maria = await sesion(browser, MARIA);
  const idProyecto = await idProyectoPorTitulo(lider.page, PROYECTO_TUTORIAS);
  let tareas: TareaCreada[] = [];
  try {
    const idMaria = await idIntegrante(lider.page, idProyecto, MARIA);
    tareas = await asignarTareas(lider.page, idProyecto, [{ titulo: `${etiqueta} tarea`, idUsuario: idMaria }]);
    const [aviso] = await esperarAvisos(maria.page, etiqueta, 1);
    expect(aviso.tipoNotificacion).toBe('TAREA_ASIGNADA');
    expect(aviso.leidaEn, 'el aviso recién creado está sin leer').toBeNull();
    const pendientesAntes = await noLeidas(maria.page);

    const page = maria.page;
    await abrirCentro(page);
    await buscar(page, etiqueta);
    await expect.poll(() => idsVisibles(page)).toEqual(ordenados(aviso));
    await expect(fila(page, aviso.idNotificacion)).toHaveAttribute('data-leida', 'false');

    const lecturas: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && r.url().includes(`/notificaciones/${aviso.idNotificacion}/leer`)) lecturas.push(r.url());
    });
    await fila(page, aviso.idNotificacion).getByRole('button').click();

    // El visor muestra ESTE aviso: su título y su mensaje con la tarea de la prueba.
    const visor = page.getByRole('article');
    await expect(visor.getByRole('heading', { level: 3 })).toHaveText(aviso.tituloNotificacion);
    await expect(visor).toContainText(`${etiqueta} tarea`);
    await expect(fila(page, aviso.idNotificacion).getByRole('button')).toHaveAttribute('aria-current', 'true');

    // Abrirlo lo lee una vez: la fila y el visor pierden el estado de no leída y la API lo confirma.
    await expect.poll(() => lecturas.length).toBe(1);
    await expect(fila(page, aviso.idNotificacion)).toHaveAttribute('data-leida', 'true');
    await expect(visor.getByText('No leída', { exact: true })).toHaveCount(0);
    await expect(visor.getByRole('button', { name: 'Marcar como leída' })).toHaveCount(0);
    const [releido] = await avisosCon(page, etiqueta);
    expect(releido.leidaEn).not.toBeNull();
    await expect.poll(() => noLeidas(page)).toBe(pendientesAntes - 1);

    // Destino según el tipo: una TAREA_ASIGNADA lleva a la vista de SU tarea en el Kanban.
    const destino = `/dashboard/projects/${idProyecto}/kanban/tasks/${tareas[0].idTarea}`;
    const verTarea = visor.getByRole('link', { name: 'Ver tarea' });
    await expect(verTarea).toHaveAttribute('href', destino);
    await verTarea.click();
    await expect(page).toHaveURL(new RegExp(`${destino}(\\?|$)`));
    await expect(page.getByText(tareas[0].tituloTarea).first()).toBeVisible({ timeout: 20_000 });
    expect(maria.errores, 'errores de página al abrir el aviso').toEqual([]);
  } finally {
    await eliminarTareas(lider.page, idProyecto, tareas);
    await Promise.all([lider.contexto.close(), maria.contexto.close()]);
  }
});

test('C · marcar todas: sin filtros lee todos los avisos propios, persiste y no toca los de otra cuenta', async ({ browser }, testInfo) => {
  const etiqueta = marca(testInfo, 'T372 todas');
  const lider = await sesion(browser, CARLOS);
  const maria = await sesion(browser, MARIA);
  const jose = await sesion(browser, JOSE);
  const idProyecto = await idProyectoPorTitulo(lider.page, PROYECTO_TUTORIAS);
  let tareas: TareaCreada[] = [];
  try {
    const idMaria = await idIntegrante(lider.page, idProyecto, MARIA);
    const idJose = await idIntegrante(lider.page, idProyecto, JOSE);
    tareas = await asignarTareas(lider.page, idProyecto, [
      { titulo: `${etiqueta} uno`, idUsuario: idMaria },
      { titulo: `${etiqueta} dos`, idUsuario: idMaria },
      { titulo: `${etiqueta} ajena`, idUsuario: idJose },
    ]);
    const propios = await esperarAvisos(maria.page, etiqueta, 2);
    expect(propios.every((a) => a.leidaEn === null), 'los avisos de la prueba nacen sin leer').toBe(true);
    const [ajeno] = await esperarAvisos(jose.page, etiqueta, 1);
    expect(ajeno.leidaEn).toBeNull();
    const pendientesJose = await noLeidas(jose.page);
    const pendientes = await noLeidas(maria.page);
    expect(pendientes).toBeGreaterThanOrEqual(2);

    const page = maria.page;
    await abrirCentro(page);
    await expect(bandeja(page).getByText(new RegExp(`· ${pendientes} sin leer$`))).toBeVisible();
    await expect(bandeja(page).getByText(`${pendientes} nuevas`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Notificaciones, ${pendientes} sin leer` }).first()).toBeVisible();
    for (const aviso of propios) await expect(fila(page, aviso.idNotificacion)).toHaveAttribute('data-leida', 'false');

    // Sin filtros, el botón abarca todas las propias.
    const marcar = page.getByRole('button', { name: 'Marcar todas como leídas' });
    await expect(marcar).toBeEnabled();
    const respuesta = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/notificaciones/leer-todas'));
    await marcar.click();
    const leerTodas = await respuesta;
    expect(leerTodas.status()).toBe(200);
    expect(new URL(leerTodas.url()).search, 'sin filtros el marcado no se acota').toBe('');
    expect(((await leerTodas.json()) as { actualizadas: number }).actualizadas).toBe(pendientes);

    await expect(page.getByText(`${pendientes} avisos marcados como leídos`)).toBeVisible();
    await expect(bandeja(page).locator('li[data-leida="false"]')).toHaveCount(0);
    for (const aviso of propios) await expect(fila(page, aviso.idNotificacion)).toHaveAttribute('data-leida', 'true');
    await expect(bandeja(page).getByText(/· 0 sin leer$/)).toBeVisible();
    await expect(bandeja(page).getByText(/^\d+ nuevas?$/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Notificaciones, no hay pendientes' }).first()).toBeVisible();
    await expect(marcar).toBeDisabled();

    // Persiste: tras recargar, la bandeja y la API siguen sin pendientes.
    await page.reload();
    await abrirCentro(page);
    await expect(bandeja(page).getByText(/· 0 sin leer$/)).toBeVisible();
    await expect(bandeja(page).locator('li[data-leida="false"]')).toHaveCount(0);
    expect(await noLeidas(page)).toBe(0);
    expect((await avisosCon(page, etiqueta)).every((a) => a.leidaEn !== null), 'los avisos de la prueba quedaron leídos').toBe(true);

    // La otra cuenta conserva su aviso sin leer y su contador intacto.
    const [ajenoDespues] = await avisosCon(jose.page, etiqueta);
    expect(ajenoDespues.leidaEn, 'el aviso de otra cuenta sigue sin leer').toBeNull();
    expect(await noLeidas(jose.page)).toBe(pendientesJose);
    expect(maria.errores, 'errores de página al marcar todas').toEqual([]);
  } finally {
    await eliminarTareas(lider.page, idProyecto, tareas);
    await Promise.all([lider.contexto.close(), maria.contexto.close(), jose.contexto.close()]);
  }
});
