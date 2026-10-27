import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import {
  CORREO_LIDER,
  LINK,
  PROYECTO,
  abrirNuevoEvento,
  borrarEventosConTitulo,
  capturar,
  diaDelSelector,
  elegirDiaDelSelector,
  eventosConTitulo,
  fijarRelojMananaTemprano,
  idDelProyecto,
  marca,
  mananaTemprano,
  overflowHorizontal,
  retirarDeudaCspDelMapa,
} from './support/calendario';

/**
 * Bloque del evento en la cuadrícula por horas. Se busca en la vista Día:
 * en Semana, si a esa hora hay más de 2 eventos (otras corridas sobre la
 * misma base), se resumen en "+N" y el bloque no se dibuja.
 */
function bloqueEvento(page: Page, titulo: string) {
  return page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) });
}

async function verDia(page: Page) {
  await page.getByRole('radio', { name: 'Día' }).click();
}

test.describe('Calendario: diálogo de evento (HU-184, T-325)', () => {
  test.beforeEach(async ({ page }) => {
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
  });

  test('no envía con campos vacíos ni con el fin antes del inicio', async ({ page }) => {
    const dialogo = await abrirNuevoEvento(page);
    const agendar = dialogo.getByRole('button', { name: 'Agendar evento' });

    // Campos vacíos: título y enlace (la modalidad por defecto es virtual).
    await agendar.click();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toBeVisible();
    await expect(dialogo.getByText('Ingresa el link de la sesión.')).toBeVisible();
    await expect(dialogo).toBeVisible();

    // Hora de fin antes de la de inicio, mismo día.
    await dialogo.getByLabel('Título del evento o actividad').fill('Evento que no debe crearse');
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('10:00');
    await dialogo.getByLabel('Hora de fin').fill('09:00');
    await agendar.click();
    await expect(dialogo.getByText('El fin debe ser posterior al inicio.')).toBeVisible();
    await expect(dialogo.getByText('El título no puede estar vacío.')).toHaveCount(0);
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('button', { name: /^Evento que no debe crearse/ })).toHaveCount(0);
  });

  test('crea, edita y borra un evento desde el diálogo', async ({ page }) => {
    const titulo = `E2E HU-184 ${Date.now()}`;
    const tituloEditado = `${titulo} editado`;

    // Crear (tipo Tutoría, virtual, horario propuesto 09:00–10:00)
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Tipo de actividad').click();
    await page.getByRole('option', { name: 'Tutoría' }).click();
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await expect(dialogo.getByText('Google Meet')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    await expect(dialogo).toBeHidden();

    // El bloque de la cuadrícula abre el detalle del evento.
    await verDia(page);
    const bloque = bloqueEvento(page, titulo);
    await expect(bloque).toBeVisible({ timeout: 15_000 });
    await bloque.click();
    const detalle = page.getByRole('dialog', { name: titulo });
    await expect(detalle.getByText('Tutoría', { exact: true })).toBeVisible();
    await expect(detalle.getByText('Virtual', { exact: true })).toBeVisible();
    await expect(detalle.getByText(PROYECTO)).toBeVisible();

    // Editar
    await detalle.getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion.getByLabel('Título del evento o actividad')).toHaveValue(titulo);
    await edicion.getByLabel('Título del evento o actividad').fill(tituloEditado);
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();
    await expect(edicion).toBeHidden();

    const bloqueEditado = bloqueEvento(page, tituloEditado);
    await expect(bloqueEditado).toBeVisible({ timeout: 15_000 });

    // Borrar desde el diálogo de edición, con la confirmación común.
    await bloqueEditado.click();
    await page.getByRole('dialog', { name: tituloEditado }).getByRole('button', { name: 'Editar evento' }).click();
    await edicion.getByRole('button', { name: 'Eliminar evento' }).click();
    const confirmacion = page.getByRole('alertdialog');
    await expect(confirmacion).toContainText(tituloEditado);
    await confirmacion.getByRole('button', { name: 'Eliminar evento' }).click();
    await expect(page.getByText('Evento eliminado')).toBeVisible();
    await expect(edicion).toBeHidden();
    await expect(bloqueEvento(page, tituloEditado)).toHaveCount(0, { timeout: 15_000 });
  });

  // G02-C14 (UI-06, UI-05, T-325): fecha de fin opcional, medianoche y evento nocturno.
  test('crea un evento 22:00 → 01:00 con "Termina otro día": se ve en ambos días como bloques con hora, no como todo el día', async ({ page }) => {
    const titulo = `E2E nocturno ${Date.now()}`;
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('22:00');
    await dialogo.getByLabel('Hora de fin').fill('01:00');
    // Sin fecha de fin el fin cae "antes" del inicio.
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(dialogo.getByText('El fin debe ser posterior al inicio.')).toBeVisible();

    await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
    await dialogo.getByLabel('Fecha de fin').click();
    // El reloj fijo es "mañana" y es la fecha propuesta: el fin cae el día siguiente.
    const fin = mananaTemprano();
    fin.setDate(fin.getDate() + 1);
    await elegirDiaDelSelector(page, fin, mananaTemprano());
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    try {
      await verDia(page);
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 22:00 a 00:00 del día siguiente`) })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Todo el día')).toHaveCount(0);
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 00:00 a 01:00`) })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Todo el día')).toHaveCount(0);
      // El detalle muestra inicio y fin completos (cambia de día).
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 00:00 a 01:00`) }).click();
      await expect(page.getByRole('dialog', { name: titulo }).getByText(/22:00 – .*01:00/)).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 22:00 a 00:00`) }).click();
      await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
      await expect(page.getByText('Evento eliminado')).toBeVisible();
    }
  });

  test('un evento que termina exactamente a las 00:00 ocupa hasta el final de su día y no aparece al siguiente', async ({ page }) => {
    const titulo = `E2E medianoche ${Date.now()}`;
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await dialogo.getByLabel('Hora de inicio').fill('23:00');
    await dialogo.getByLabel('Hora de fin').fill('00:00');
    await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
    await dialogo.getByLabel('Fecha de fin').click();
    const manana = new Date();
    manana.setDate(manana.getDate() + 2);
    await page.getByRole('button', { name: new RegExp(`, ${manana.getDate()} de `) }).first().click();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    try {
      await verDia(page);
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}, 23:00 a 00:00 del día siguiente`) })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${titulo}`) })).toHaveCount(0);
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    } finally {
      await page.getByRole('button', { name: new RegExp(`^${titulo}, 23:00 a 00:00`) }).click();
      await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
      await expect(page.getByText('Evento eliminado')).toBeVisible();
    }
  });

  // G02-C14 (UI-03): la búsqueda de lugar se simula (sin Nominatim real) con un nombre de 300 caracteres.
  // G05-C10 (clase B): esta prueba nunca se había ejecutado contra el stack real. Al hacerlo falló por las
  // violaciones CSP (Report-Only) del mapa, que es deuda ajena a HU-184: ver retirarDeudaCspDelMapa.
  test('un evento presencial muestra el error de ubicación junto al campo y recorta un nombre de lugar demasiado largo', async ({ page, cspViolations }) => {
    const nombreLargo = 'Edificio ' + 'x'.repeat(300);
    await page.route('**/nominatim.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ place_id: 1, display_name: nombreLargo, lat: '14.6', lon: '-90.5' }]) }),
    );
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill('Visita presencial que no se crea');
    await dialogo.getByRole('radio', { name: 'Presencial' }).click();
    // El selector de lugar se carga aparte (next/dynamic). Se espera a que exista antes de enviar: si se envía
    // antes, el error aparece igual pero el foco se queda en el botón (carrera registrada en la auditoría de G05).
    const input = dialogo.getByLabel('Ubicación presencial');
    await expect(input).toBeVisible();
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    const error = dialogo.getByText('Marca la ubicación de la sesión en el mapa.');
    await expect(error).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();

    await input.fill('Edificio');
    await dialogo.getByRole('button', { name: 'Buscar ubicación' }).click();
    await page.getByRole('button', { name: new RegExp(`^${nombreLargo.slice(0, 20)}`) }).click();
    await expect(input).toHaveValue(nombreLargo.slice(0, 255));
    await expect(error).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-invalid', 'false');

    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo).toBeHidden();
    expect(retirarDeudaCspDelMapa(cspViolations).length).toBeGreaterThan(0);
  });
});

/**
 * G05-C10 (T-325, F262-04): ciclo de vida y validaciones contra el stack real,
 * ampliando lo anterior. Cada prueba marca sus eventos con un título único y
 * los borra por API al terminar, pase o falle, sin depender del orden.
 */
async function rellenarVirtual(dialogo: Locator, titulo: string) {
  await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
  await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
}

/** Peticiones de creación que salen del navegador durante la prueba. */
function contarCreaciones(page: Page) {
  const estados: number[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && /\/api\/proyectos\/\d+\/eventos$/.test(new URL(r.url()).pathname)) estados.push(r.status());
  });
  return estados;
}

async function simularBuscadorDeLugares(page: Page, nombre: string) {
  // Nominatim es un servicio de terceros: se responde aquí. El backend y la base son reales.
  await page.route('**/nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ place_id: 1, display_name: nombre, lat: '14.6045', lon: '-90.4896' }]) }),
  );
}

async function elegirLugar(page: Page, dialogo: Locator, nombre: string) {
  await dialogo.getByLabel('Ubicación presencial').fill(nombre.slice(0, 8));
  await dialogo.getByRole('button', { name: 'Buscar ubicación' }).click();
  await page.getByRole('button', { name: new RegExp(`^${nombre.slice(0, 16)}`) }).click();
  await expect(dialogo.getByLabel('Ubicación presencial')).toHaveValue(nombre);
}

test.describe('Calendario: ciclo de vida completo del evento (HU-184, G05-C10)', () => {
  let etiqueta = '';

  test.beforeEach(async ({ page }, testInfo) => {
    etiqueta = marca(testInfo, 'E2E G05');
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
  });

  test.afterEach(async ({ page }) => {
    await borrarEventosConTitulo(page, etiqueta);
  });

  test('las fechas pasadas no se pueden elegir y un inicio anterior a ahora no llega al servidor', async ({ page }) => {
    const creaciones = contarCreaciones(page);
    const dialogo = await abrirNuevoEvento(page);
    await rellenarVirtual(dialogo, etiqueta);

    // El selector abre en el mes de "hoy" (reloj fijo): ayer está deshabilitado y hoy no.
    const hoy = mananaTemprano();
    const ayer = new Date(hoy);
    ayer.setDate(hoy.getDate() - 1);
    await dialogo.getByLabel('Fecha', { exact: true }).click();
    const selector = page.locator('[data-slot="popover-content"]');
    await expect(diaDelSelector(page, hoy)).toBeEnabled();
    if (ayer.getMonth() !== hoy.getMonth()) await selector.getByRole('button', { name: /previous|anterior/i }).click();
    await expect(diaDelSelector(page, ayer)).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(selector).toBeHidden();

    // Hoy, pero a una hora que ya pasó para el reloj del navegador (08:00).
    await dialogo.getByLabel('Hora de inicio').fill('06:00');
    await dialogo.getByLabel('Hora de fin').fill('07:00');
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(dialogo.getByText('El inicio no puede ser anterior al momento actual.')).toBeVisible();
    await expect(dialogo.getByLabel('Hora de inicio')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialogo).toBeVisible();
    expect(creaciones).toEqual([]);
    expect(await eventosConTitulo(page, etiqueta)).toEqual([]);
  });

  test('la API real rechaza con 400 lo que el formulario impide: inicio pasado, fin antes del inicio y enlace sin dominio', async ({ page }) => {
    await page.goto('/dashboard/calendario');
    const idProyecto = await idDelProyecto(page);
    const en = (dias: number, hora: number) => {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + dias);
      fecha.setHours(hora, 0, 0, 0);
      return fecha.toISOString();
    };
    const base = { tituloEvento: etiqueta, modalidad: 'VIRTUAL', linkSesion: LINK };
    const casos: [string, Record<string, unknown>, RegExp][] = [
      ['inicio pasado', { ...base, fechaInicio: en(-2, 9), fechaFin: en(-2, 10) }, /no puede ser anterior al momento actual/],
      ['fin antes del inicio', { ...base, fechaInicio: en(3, 10), fechaFin: en(3, 9) }, /debe ser posterior/],
      ['fin igual al inicio', { ...base, fechaInicio: en(3, 10), fechaFin: en(3, 10) }, /debe ser posterior/],
      ['enlace sin dominio real', { ...base, fechaInicio: en(3, 9), fechaFin: en(3, 10), linkSesion: 'http://localhost:3000/sala' }, /linkSesion/],
      ['virtual sin enlace', { tituloEvento: etiqueta, modalidad: 'VIRTUAL', fechaInicio: en(3, 9), fechaFin: en(3, 10) }, /linkSesion/],
      ['presencial sin coordenadas', { tituloEvento: etiqueta, modalidad: 'PRESENCIAL', fechaInicio: en(3, 9), fechaFin: en(3, 10) }, /ubicacionLat/],
      ['título vacío', { ...base, tituloEvento: '   ', fechaInicio: en(3, 9), fechaFin: en(3, 10) }, /tituloEvento/],
    ];
    for (const [nombre, data, mensaje] of casos) {
      const respuesta = await page.request.post(`/api/proyectos/${idProyecto}/eventos`, { data });
      expect(respuesta.status(), nombre).toBe(400);
      expect(JSON.stringify((await respuesta.json()).message), nombre).toMatch(mensaje);
    }
    expect(await eventosConTitulo(page, etiqueta)).toEqual([]);
  });

  test('un doble clic en "Agendar evento" crea un solo evento', async ({ page }) => {
    const creaciones = contarCreaciones(page);
    const dialogo = await abrirNuevoEvento(page);
    await rellenarVirtual(dialogo, etiqueta);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).dblclick();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    await expect(dialogo).toBeHidden();
    expect(creaciones).toEqual([201]);
    expect(await eventosConTitulo(page, etiqueta)).toHaveLength(1);
  });

  test('cancelar la confirmación de eliminar conserva el evento; confirmarla lo quita del calendario y de la API', async ({ page }) => {
    const dialogo = await abrirNuevoEvento(page);
    await rellenarVirtual(dialogo, etiqueta);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    await verDia(page);
    const bloque = bloqueEvento(page, etiqueta);
    await expect(bloque).toBeVisible({ timeout: 15_000 });

    await bloque.click();
    const detalle = page.getByRole('dialog', { name: etiqueta });
    await detalle.getByRole('button', { name: 'Eliminar evento' }).click();
    const confirmacion = page.getByRole('alertdialog');
    await expect(confirmacion).toContainText(etiqueta);
    await confirmacion.getByRole('button', { name: /Cancelar/ }).click();
    await expect(confirmacion).toBeHidden();
    await expect(detalle).toBeVisible();
    expect(await eventosConTitulo(page, etiqueta)).toHaveLength(1);

    await detalle.getByRole('button', { name: 'Eliminar evento' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
    await expect(page.getByText('Evento eliminado')).toBeVisible();
    await expect(bloqueEvento(page, etiqueta)).toHaveCount(0, { timeout: 15_000 });
    expect(await eventosConTitulo(page, etiqueta)).toEqual([]);
    // Tras recargar sigue sin aparecer: no era solo un cambio en pantalla.
    await page.reload();
    await verDia(page);
    await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
    await expect(bloqueEvento(page, etiqueta)).toHaveCount(0);
  });

  test('un evento presencial se guarda con su lugar y sus coordenadas, y el detalle lo muestra sin enlace de sesión', async ({ page, cspViolations }) => {
    const lugar = 'Edificio CIT, Universidad del Valle de Guatemala';
    await simularBuscadorDeLugares(page, lugar);
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(etiqueta);
    await dialogo.getByRole('radio', { name: 'Presencial' }).click();
    await expect(dialogo.getByLabel('Enlace de conexión virtual')).toHaveCount(0);
    await elegirLugar(page, dialogo, lugar);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    const [guardado] = await eventosConTitulo(page, etiqueta);
    expect(guardado).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionNombre: lugar, linkSesion: null });
    expect(guardado.ubicacionLat).toBeCloseTo(14.6045, 3);
    expect(guardado.ubicacionLng).toBeCloseTo(-90.4896, 3);

    await verDia(page);
    await bloqueEvento(page, etiqueta).click();
    const detalle = page.getByRole('dialog', { name: etiqueta });
    await expect(detalle.getByText('Presencial', { exact: true })).toBeVisible();
    await expect(detalle.getByText(lugar)).toBeVisible();
    await expect(detalle.getByRole('link', { name: 'Abrir en el mapa' })).toHaveAttribute('href', /^https:\/\//);
    await expect(detalle.getByText('Link de la sesión')).toHaveCount(0);
    await page.keyboard.press('Escape');
    retirarDeudaCspDelMapa(cspViolations);
  });

  test('un evento híbrido pide enlace y lugar; al editarlo a virtual el servidor borra la ubicación y conserva el enlace', async ({ page, cspViolations }) => {
    const lugar = 'Salón 210, Edificio CIT';
    await simularBuscadorDeLugares(page, lugar);
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(etiqueta);
    await dialogo.getByRole('radio', { name: 'Híbrida' }).click();
    // Sin enlace ni punto: los dos errores a la vez, junto a su campo.
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(dialogo.getByText('Ingresa el link de la sesión.')).toBeVisible();
    await expect(dialogo.getByText('Marca la ubicación de la sesión en el mapa.')).toBeVisible();
    await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK);
    await elegirLugar(page, dialogo, lugar);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    expect((await eventosConTitulo(page, etiqueta))[0]).toMatchObject({ modalidad: 'MIXTA', ubicacionNombre: lugar, linkSesion: LINK });

    await verDia(page);
    await bloqueEvento(page, etiqueta).click();
    await page.getByRole('dialog', { name: etiqueta }).getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion.getByLabel('Ubicación presencial')).toHaveValue(lugar);
    await edicion.getByRole('radio', { name: 'Virtual' }).click();
    await expect(edicion.getByLabel('Ubicación presencial')).toHaveCount(0);
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();

    const [editado] = await eventosConTitulo(page, etiqueta);
    expect(editado).toMatchObject({ modalidad: 'VIRTUAL', linkSesion: LINK, ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null });
    await bloqueEvento(page, etiqueta).click();
    const detalle = page.getByRole('dialog', { name: etiqueta });
    await expect(detalle.getByText('Virtual', { exact: true })).toBeVisible();
    await expect(detalle.getByText(lugar)).toHaveCount(0);
    await expect(detalle.getByText('Dónde')).toHaveCount(0);
    await page.keyboard.press('Escape');
    retirarDeudaCspDelMapa(cspViolations);
  });

  test('un enlace sin dominio real se explica junto al campo y no genera ninguna petición', async ({ page }) => {
    const creaciones = contarCreaciones(page);
    const dialogo = await abrirNuevoEvento(page);
    await dialogo.getByLabel('Título del evento o actividad').fill(etiqueta);
    const enlace = dialogo.getByLabel('Enlace de conexión virtual');
    for (const [valor, mensaje] of [
      ['http://localhost:3000/sala', /El link no parece válido/],
      ['https://intranet/sala', /El link no parece válido/],
      ['meet.google.com/x', 'El link debe empezar con http:// o https://.'],
      ['javascript:alert(1)', 'El link debe empezar con http:// o https://.'],
    ] as const) {
      await enlace.fill(valor);
      await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
      await expect(dialogo.getByText(mensaje)).toBeVisible();
      await expect(enlace).toHaveAttribute('aria-invalid', 'true');
    }
    expect(creaciones).toEqual([]);
    await enlace.fill(LINK);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();
    expect(creaciones).toEqual([201]);
  });

  test('un evento de tres días elegido navegando el selector de fecha aparece en cada día y conserva sus fechas al editar el título', async ({ page }) => {
    const dialogo = await abrirNuevoEvento(page);
    await rellenarVirtual(dialogo, etiqueta);
    const inicio = mananaTemprano();
    inicio.setDate(inicio.getDate() + 3);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 2);
    const elegir = async (campo: string, fecha: Date, desde: Date) => {
      await dialogo.getByLabel(campo, { exact: true }).click();
      const selector = page.locator('[data-slot="popover-content"]');
      // Navegar el selector mes a mes hasta el de la fecha (si cae en el siguiente).
      const saltos = (fecha.getFullYear() - desde.getFullYear()) * 12 + fecha.getMonth() - desde.getMonth();
      for (let i = 0; i < saltos; i += 1) await selector.getByRole('button', { name: /next|siguiente/i }).click();
      await diaDelSelector(page, fecha).click();
      await expect(selector).toBeHidden();
    };
    await elegir('Fecha', inicio, mananaTemprano());
    await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
    await elegir('Fecha de fin', fin, inicio);
    await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
    await expect(page.getByText('Evento agendado')).toBeVisible();

    const [creado] = await eventosConTitulo(page, etiqueta);
    const local = (iso: string) => new Date(iso);
    expect([local(creado.fechaInicio).getDate(), local(creado.fechaInicio).getHours()]).toEqual([inicio.getDate(), 9]);
    expect([local(creado.fechaFin).getDate(), local(creado.fechaFin).getHours()]).toEqual([fin.getDate(), 10]);

    // Vista Día de cada una de las tres fechas: el evento está en las tres.
    await verDia(page);
    for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    for (let dia = 0; dia < 3; dia += 1) {
      await expect(page.getByRole('button', { name: new RegExp(`^${etiqueta}`) }).first()).toBeVisible({ timeout: 15_000 });
      if (dia < 2) await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${etiqueta}`) })).toHaveCount(0);
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();

    // Editar solo el título no mueve ni colapsa las fechas.
    await page.getByRole('button', { name: new RegExp(`^${etiqueta}`) }).first().click();
    await page.getByRole('dialog', { name: etiqueta }).getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion.getByRole('checkbox', { name: 'Termina otro día' })).toBeChecked();
    await edicion.getByLabel('Título del evento o actividad').fill(`${etiqueta} editado`);
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Evento actualizado')).toBeVisible();
    const [editado] = await eventosConTitulo(page, `${etiqueta} editado`);
    expect([editado.fechaInicio, editado.fechaFin]).toEqual([creado.fechaInicio, creado.fechaFin]);
  });

  for (const [ancho, alto, tema] of [
    [375, 812, 'light'],
    [375, 812, 'dark'],
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
  ] as const) {
    test(`el diálogo completo cabe y se puede usar en ${ancho} px (${tema}): sin desbordes y con el evento creado`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.setViewportSize({ width: ancho, height: alto });
      const dialogo = await abrirNuevoEvento(page);
      await rellenarVirtual(dialogo, etiqueta);
      await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();

      const medidas = await dialogo.evaluate((raiz) => {
        const caja = raiz.getBoundingClientRect();
        const cuerpo = raiz.querySelector('.overflow-y-auto') as HTMLElement;
        const fueraDelDialogo = [...raiz.querySelectorAll<HTMLElement>('button, input, [role="radio"], [role="combobox"], [role="checkbox"]')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && el.getAttribute('aria-hidden') !== 'true' && (r.right > caja.right + 0.5 || r.left < caja.left - 0.5);
        }).length;
        const modalidades = [...raiz.querySelectorAll('[role="radiogroup"] [role="radio"] span')].map((s) => ({ texto: s.textContent, cortado: s.scrollWidth > s.clientWidth }));
        return { dentroDeLaVentana: caja.left >= 0 && caja.right <= window.innerWidth, scrollLateral: cuerpo.scrollWidth - cuerpo.clientWidth, fueraDelDialogo, modalidades };
      });
      expect(medidas).toEqual({
        dentroDeLaVentana: true,
        scrollLateral: 0,
        fueraDelDialogo: 0,
        modalidades: [{ texto: 'Presencial', cortado: false }, { texto: 'Virtual', cortado: false }, { texto: 'Híbrida', cortado: false }],
      });
      expect(await overflowHorizontal(page)).toBe(0);
      await capturar(page, testInfo, `c10-dialogo-crear-${ancho}-${tema}`);

      await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
      await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
      await expect(page.getByText('Evento agendado')).toBeVisible();
      await expect(dialogo).toBeHidden();
      expect(await eventosConTitulo(page, etiqueta)).toHaveLength(1);
      expect(await overflowHorizontal(page)).toBe(0);
    });
  }
});
