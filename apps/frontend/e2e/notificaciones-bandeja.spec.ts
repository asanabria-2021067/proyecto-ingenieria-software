import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { analizarAccesibilidad, violacionesBloqueantes, describirViolaciones } from './support/a11y';
import { API_URL, desactivarTour } from './support/realtime';
import { api } from './support/calendario';

/**
 * Sprint 10 — centro de notificaciones como bandeja (lista compacta con sus
 * filtros y visor) contra la pila real. Lectura sobre los avisos sembrados de la
 * cuenta; el único cambio que persiste es leer el aviso que se abre (el mismo
 * contrato que ya usaba la campana). Los tres tipos de reunión de HU-195 no
 * existen en la siembra: su visor se comprueba respondiendo SOLO ese listado
 * con un fixture, nunca escribiendo en la base.
 */

test.describe.configure({ timeout: 90_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const API = `${API_URL}/api`;

interface Aviso {
  idNotificacion: number;
  tituloNotificacion: string;
  tipoNotificacion: string;
  leidaEn: string | null;
}

async function abrirBandeja(page: Page) {
  await page.goto('/dashboard/notificaciones');
  await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();
  // La lista y los siete conteos por categoría llegan en paralelo: más margen que el default.
  await expect(page.getByRole('region', { name: 'Bandeja de entrada' }).getByText(/\d+ avisos? · \d+ sin leer/)).toBeVisible({ timeout: 20_000 });
}

/**
 * Primeros avisos propios desde la API real. Pasa por `api`, que solo reintenta los 429 del límite de
 * peticiones (acotado): la bandeja acaba de lanzar su ráfaga y una lectura directa recibía 429 sin datos.
 */
async function avisos(page: Page, limit: number): Promise<Aviso[]> {
  const respuesta = await api(page, 'get', `${API}/notificaciones?page=1&limit=${limit}`);
  // Un 401, 403 o 500 (o un 429 que no cede) se informa como tal, no como un `data` indefinido.
  expect(respuesta.status(), `GET /notificaciones: ${await respuesta.text()}`).toBe(200);
  return ((await respuesta.json()) as { data: Aviso[] }).data;
}

const filas = (page: Page) => page.getByRole('region', { name: 'Bandeja de entrada' }).locator('li[data-notificacion]');

test.beforeEach(async ({ page }) => {
  await desactivarTour(page);
  await login(page, CARLOS);
  await page.evaluate(() => localStorage.removeItem('react-resizable-panels:uvg-collab-inbox-panels'));
});

test('la lista pagina del servidor, el visor abre el aviso y lo lee una sola vez', async ({ page }) => {
  const propios = await avisos(page, 20);
  test.skip(propios.length === 0, 'La cuenta no tiene notificaciones sembradas');
  await abrirBandeja(page);

  await expect(filas(page).first()).toBeVisible();
  const primero = propios[0];
  await expect(filas(page).first()).toHaveAttribute('data-notificacion', String(primero.idNotificacion));
  await expect(page.getByRole('status').filter({ hasText: 'Selecciona una notificación' })).toBeVisible();

  const peticionesLeer: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/leer')) peticionesLeer.push(r.url());
  });
  await filas(page).first().getByRole('button').click();
  const visor = page.getByRole('article');
  await expect(visor.getByRole('heading', { level: 3 })).toHaveText(primero.tituloNotificacion);
  await expect(page.getByRole('heading', { level: 2, name: 'Detalle de la notificación' })).toBeVisible();

  if (primero.leidaEn === null) {
    await expect.poll(() => peticionesLeer.length).toBe(1);
    await expect(filas(page).first()).toHaveAttribute('data-leida', 'true');
    await filas(page).first().getByRole('button').click();
    await page.waitForTimeout(400);
    expect(peticionesLeer).toHaveLength(1);
    const [releido] = await avisos(page, 1);
    expect(releido.leidaEn).not.toBeNull();
  } else {
    expect(peticionesLeer).toHaveLength(0);
  }
  await expect(page.getByRole('button', { name: 'Notificación anterior' })).toBeDisabled();
});

test('sin sidebar secundaria: la bandeja va pegada a la sidebar global y los filtros viven en su barra', async ({ page }) => {
  await abrirBandeja(page);
  await expect(page.getByRole('complementary', { name: 'Carpetas de notificaciones' })).toHaveCount(0);
  const medidas = await page.evaluate(() => {
    const global = document.querySelector('aside.student-sidebar, aside.admin-sidebar')!.getBoundingClientRect();
    const bandeja = document.querySelector('[role="region"][aria-label="Bandeja de entrada"]')!.getBoundingClientRect();
    const grupo = document.querySelector('[data-panel-group]')!.getBoundingClientRect();
    return { globalRight: global.right, bandejaLeft: bandeja.left, grupoRight: grupo.right, grupoBottom: grupo.bottom, w: innerWidth, h: innerHeight };
  });
  expect(Math.abs(medidas.bandejaLeft - medidas.globalRight)).toBeLessThan(2);
  expect(Math.abs(medidas.grupoRight - medidas.w)).toBeLessThan(2);
  expect(Math.abs(medidas.grupoBottom - medidas.h)).toBeLessThan(2);
  const lista = page.getByRole('region', { name: 'Bandeja de entrada' });
  await expect(lista.getByRole('combobox', { name: 'Filtrar por categoría' })).toHaveText('Todas las categorías');
  await expect(lista.getByRole('combobox', { name: 'Filtrar por proyecto' })).toHaveText('Todos los proyectos');
  await lista.getByRole('combobox', { name: 'Filtrar por categoría' }).click();
  await expect(page.getByRole('option', { name: 'Recordatorios y calendario' })).toBeVisible();
  await page.keyboard.press('Escape');
  // La sidebar global no cambió.
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
});

test('pestañas, categoría, búsqueda y orden viajan al servidor y acotan el marcado', async ({ page }) => {
  await abrirBandeja(page);
  const lista = page.getByRole('region', { name: 'Bandeja de entrada' });

  const noLeidas = page.waitForRequest((r) => r.url().includes('/notificaciones?') && r.url().includes('leida=false') && !r.url().includes('tipos='));
  await lista.getByRole('radio', { name: 'No leídas' }).click();
  await noLeidas;
  await expect(page.getByRole('button', { name: 'Marcar todas como leídas' })).toBeVisible();

  const porCategoria = page.waitForRequest((r) => r.url().includes('tipos=') && r.url().includes('leida=false') && r.url().includes('TAREA_ASIGNADA') && r.url().includes('page=1&limit=20'));
  await lista.getByRole('combobox', { name: 'Filtrar por categoría' }).click();
  await page.getByRole('option', { name: 'Tareas e hitos' }).click();
  await porCategoria;
  await expect(page.getByRole('button', { name: 'Marcar como leídas las de esta categoría' })).toBeVisible();

  const busqueda = page.waitForRequest((r) => r.url().includes('q=zzz-sin-coincidencia'));
  await lista.getByRole('textbox', { name: 'Buscar notificaciones por título o contenido' }).fill('zzz-sin-coincidencia');
  await busqueda;
  await expect(lista.getByText('Sin resultados')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar filtradas como leídas' })).toBeDisabled();
  await lista.getByRole('button', { name: 'Limpiar búsqueda' }).click();

  const ascendente = page.waitForRequest((r) => r.url().includes('orden=asc'));
  const orden = lista.getByRole('button', { name: /^Orden:/ });
  await expect(orden).toHaveText('Más recientes');
  await orden.click();
  await expect(orden).toHaveText('Más antiguas');
  await ascendente;
  // Volver a «desc» reutiliza la consulta ya cacheada con los mismos filtros: no hay petición nueva que esperar.
  await orden.click();
  await expect(orden).toHaveText('Más recientes');
  await expect(orden).toHaveAttribute('data-orden', 'desc');

  await lista.getByRole('combobox', { name: 'Filtrar por proyecto' }).click();
  const sinProyecto = page.waitForRequest((r) => r.url().includes('proyecto=ninguno'));
  await page.getByRole('option', { name: 'Avisos sin proyecto' }).click();
  await sinProyecto;
});

test('la bandeja se redimensiona con el teclado y restablece su ancho con doble clic', async ({ page }) => {
  const propios = await avisos(page, 1);
  test.skip(propios.length === 0, 'La cuenta no tiene notificaciones sembradas');
  await abrirBandeja(page);
  await filas(page).first().getByRole('button').click();
  const lista = page.getByRole('region', { name: 'Bandeja de entrada' });
  const antes = (await lista.boundingBox())!.width;

  const separador = page.getByRole('separator', { name: 'Redimensionar bandeja' });
  await separador.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await lista.boundingBox())!.width).toBeGreaterThan(antes + 20);
  await separador.dblclick();
  await expect.poll(async () => Math.abs((await lista.boundingBox())!.width - antes)).toBeLessThan(8);

  await expect(page.getByRole('button', { name: /Contraer bandeja|Restaurar bandeja/ })).toHaveCount(0);
  await expect(filas(page).first().getByRole('button')).toHaveAttribute('aria-current', 'true');
});

test('en móvil alterna entre la lista y el detalle conservando el aviso', async ({ page }) => {
  const propios = await avisos(page, 1);
  test.skip(propios.length === 0, 'La cuenta no tiene notificaciones sembradas');
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirBandeja(page);
  await expect(page.getByRole('combobox', { name: 'Filtrar por categoría' })).toBeVisible();
  await filas(page).first().getByRole('button').click();
  await expect(page.getByRole('article').getByRole('heading', { level: 3 })).toHaveText(propios[0].tituloNotificacion);
  await expect(page.getByRole('region', { name: 'Bandeja de entrada' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a notificaciones' }).click();
  await expect(filas(page).first().getByRole('button')).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('las reuniones de Administración (HU-195) se presentan con sus detalles; la cancelada no enlaza', async ({ page }) => {
  const ahora = new Date().toISOString();
  const base = { idUsuario: 0, mensajeNotificacion: null as string | null, creadaEn: ahora, leidaEn: ahora };
  const fixture = [
    { ...base, idNotificacion: 990001, tipoNotificacion: 'REUNION_PROGRAMADA', tituloNotificacion: 'Nueva reunión de Administración', mensajeNotificacion: 'Administración convocó a tu equipo de "Tutorías" a "Seguimiento" el lunes 3 a las 10:00.', datosJson: { meetingId: 1, eventId: 1, projectId: 1, projectTitle: 'Tutorías', eventTitle: 'Seguimiento', fechaInicioTexto: 'lunes 3 a las 10:00', fechaInicioIso: ahora } },
    { ...base, idNotificacion: 990002, tipoNotificacion: 'REUNION_ACTUALIZADA', tituloNotificacion: 'Reunión de Administración actualizada', mensajeNotificacion: 'Cambió la reunión "Seguimiento". Ahora es el martes 4 a las 10:00.', datosJson: { meetingId: 1, eventId: 1, projectId: 1, projectTitle: 'Tutorías', eventTitle: 'Seguimiento', fechaInicioTexto: 'martes 4 a las 10:00', fechaInicioIso: ahora } },
    { ...base, idNotificacion: 990003, tipoNotificacion: 'REUNION_CANCELADA', tituloNotificacion: 'Reunión de Administración cancelada', mensajeNotificacion: 'Administración canceló la reunión "Seguimiento" del martes 4 a las 10:00.', datosJson: { meetingId: 1, eventTitle: 'Seguimiento', fechaInicioTexto: 'martes 4 a las 10:00', fechaInicioIso: ahora } },
  ];
  await page.route(/\/api\/notificaciones\?page=1&limit=20(&orden=desc)?$/, (route) => route.fulfill({ json: { data: fixture, total: 3, page: 1, totalPages: 1 } }));
  await abrirBandeja(page);
  await expect(filas(page)).toHaveCount(3);
  await expect(filas(page).first().getByText('Administración', { exact: true })).toBeVisible();
  await expect(filas(page).first().getByText('Recordatorios y calendario')).toBeVisible();

  await filas(page).nth(0).getByRole('button').click();
  const visor = page.getByRole('article');
  await expect(visor.getByText('Reunión programada').first()).toBeVisible();
  await expect(visor.getByRole('definition').filter({ hasText: /^Seguimiento$/ })).toBeVisible();
  await expect(visor.getByRole('definition').filter({ hasText: 'lunes 3 a las 10:00' })).toBeVisible();
  await expect(visor.getByRole('link', { name: 'Ver en calendario' })).toHaveAttribute('href', '/dashboard/calendario');
  await expect(visor.getByRole('link', { name: 'Tutorías' })).toHaveAttribute('href', '/dashboard/proyectos/1');

  await page.getByRole('button', { name: 'Notificación siguiente' }).click();
  await expect(visor.getByText('Reunión actualizada').first()).toBeVisible();
  await expect(visor.getByRole('definition').filter({ hasText: 'martes 4 a las 10:00' })).toBeVisible();

  await page.getByRole('button', { name: 'Notificación siguiente' }).click();
  await expect(visor.getByText('Reunión cancelada').first()).toBeVisible();
  await expect(visor.getByRole('note')).toContainText('cancelada');
  await expect(visor.getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notificación siguiente' })).toBeDisabled();
});

for (const tema of ['light', 'dark'] as const) {
  test(`axe sin violaciones bloqueantes en ${tema}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
    await abrirBandeja(page);
    if ((await filas(page).count()) > 0) await filas(page).first().getByRole('button').click();
    const analisis = await analizarAccesibilidad(page, testInfo, `notificaciones-bandeja-${tema}`);
    const bloqueantes = violacionesBloqueantes(analisis.violaciones);
    expect(bloqueantes, describirViolaciones(bloqueantes).join('\n')).toEqual([]);
  });
}
