import type { Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './support/test';
import { login } from './support/auth';
import {
  CORREO_LIDER,
  abrirNuevoEvento,
  borrarEventosConTitulo,
  capturar,
  crearEventoPorApi,
  enDias,
  fijarRelojMananaTemprano,
  idDelProyecto,
  mananaTemprano,
  overflowHorizontal,
  retirarDeudaCspDelMapa,
} from './support/calendario';
import { esperarAnimaciones, medirContraste, medirObjetivos, medirSemantica } from './support/accesibilidad';

/**
 * G05-C13 (UI-14, UI-18, UI-32, UI-38): accesibilidad y viewport del
 * calendario en navegador real contra el stack real, sin dependencias nuevas:
 * las mediciones son propias (ver support/accesibilidad.ts). axe-core no es
 * dependencia directa del proyecto (P-5); el arnés opcional
 * e2e-harness/calendar-viewport-check.mjs lo añade cuando está disponible.
 *
 * Alcance: lo que dibuja la página del calendario y sus diálogos. La cabecera
 * y el menú generales de la aplicación no se miden aquí. Pasar estas pruebas no
 * equivale a una conformidad WCAG 2.2 AA completa.
 */
const ANCHOS = [
  [320, 568],
  [375, 900],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
] as const;
const TEMAS = ['light', 'dark'] as const;
const VISTAS = ['Semana', 'Día', 'Mes'] as const;
const CALENDARIO = '[data-e2e-calendario]';
const CONTRASTE_MINIMO = 4.5;

/** Texto informativo que dibuja el calendario (no los marcadores de posición ni lo deshabilitado). */
const TEXTO_DEL_CALENDARIO = [
  `${CALENDARIO} h1`,
  `${CALENDARIO} h2`,
  `${CALENDARIO} h3`,
  `${CALENDARIO} label`,
  `${CALENDARIO} p`,
  `${CALENDARIO} [role="radio"]`,
  `${CALENDARIO} button:not(:disabled):not([data-evento-key])`,
  `${CALENDARIO} [data-evento-key] span:not(:has(*))`,
  `${CALENDARIO} .grid-cols-7 > button[aria-pressed] span:not(:has(*))`,
].join(', ');

/** Marca el contenedor de la página del calendario (ancestro común del título y del selector de vista). */
async function marcarCalendario(page: Page) {
  await expect(page.getByRole('radiogroup', { name: 'Vista del calendario' })).toBeVisible();
  await page.evaluate(() => {
    const titulo = document.querySelector('h1') as HTMLElement;
    const vistas = document.querySelector('[role="radiogroup"][aria-label="Vista del calendario"]') as HTMLElement;
    let raiz: HTMLElement = titulo;
    while (!raiz.contains(vistas)) raiz = raiz.parentElement as HTMLElement;
    raiz.setAttribute('data-e2e-calendario', '');
  });
}

interface Fila {
  tema: string;
  ancho: number;
  alto: number;
  superficie: string;
  desbordeDocumento: number;
  controles: number;
  objetivosQueIncumplen: string[];
  objetivosPorExcepcion: number;
  contrasteMinimo: number | null;
  textosBajoContraste: string[];
  semantica: string[];
}

async function medir(page: Page, tema: string, ancho: number, alto: number, superficie: string, selector: string, textos: string): Promise<Fila> {
  await esperarAnimaciones(page);
  const objetivos = await medirObjetivos(page, selector);
  const contraste = await medirContraste(page, textos);
  const sem = await medirSemantica(page, selector);
  const problemas = [
    ...sem.saltosDeEncabezado.map((s) => `salto de encabezado ${s}`),
    ...sem.sinNombre.map((s) => `control sin nombre: ${s}`),
    ...sem.ariaInvalido,
    ...(sem.gruposSinNombre > 0 ? [`${sem.gruposSinNombre} grupo(s) o diálogo(s) sin nombre`] : []),
    ...(sem.h1 !== 1 ? [`${sem.h1} encabezados h1`] : []),
  ];
  return {
    tema,
    ancho,
    alto,
    superficie,
    desbordeDocumento: await overflowHorizontal(page),
    controles: objetivos.total,
    objetivosQueIncumplen: objetivos.pequenos.filter((o) => !o.cumple).map((o) => `${o.nombre} ${o.caja} (holgura ${o.holguraPx}px)`),
    objetivosPorExcepcion: objetivos.pequenos.filter((o) => o.cumple).length,
    contrasteMinimo: contraste.length ? Math.min(...contraste.map((c) => c.ratio)) : null,
    textosBajoContraste: [...new Set(contraste.filter((c) => c.ratio < CONTRASTE_MINIMO).map((c) => `${c.texto} ${c.ratio}:1 (${c.color} sobre ${c.fondo})`))],
    semantica: problemas,
  };
}

function guardarTabla(testInfo: TestInfo, nombre: string, filas: Fila[]) {
  const json = JSON.stringify(filas, null, 1);
  void testInfo.attach(nombre, { body: json, contentType: 'application/json' });
  const carpeta = process.env.G05_EVIDENCIAS;
  if (carpeta) {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, `${nombre}.json`), json);
  }
}

const sinProblemas = (filas: Fila[]) => filas.filter((f) => f.desbordeDocumento !== 0 || f.objetivosQueIncumplen.length > 0 || f.textosBajoContraste.length > 0 || f.semantica.length > 0);

test.describe('Calendario: accesibilidad y viewport (HU-184, G05-C13)', () => {
  let etiqueta = '';

  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    etiqueta = `E2E-C13-${Date.now()}-${testInfo.retry}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_LIDER);
    await page.goto('/dashboard/calendario');
    await borrarEventosConTitulo(page, 'E2E-C13-');
    const idProyecto = await idDelProyecto(page);
    // Contenido representativo: un evento normal, uno de 15 minutos, uno de varios días y uno el día 1 de
    // cada uno de los dos meses siguientes (alguno cae como "día de otro mes" en la vista Mes).
    const hoy = mananaTemprano();
    await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} reunión`, fechaInicio: enDias(0, 9), fechaFin: enDias(0, 10), tipoEvento: 'REUNION' });
    await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} corto`, fechaInicio: enDias(0, 11), fechaFin: enDias(0, 11, 15), tipoEvento: 'TUTORIA' });
    await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} largo`, fechaInicio: enDias(1, 9), fechaFin: enDias(2, 10), tipoEvento: 'ENTREGA' });
    for (const meses of [1, 2]) {
      const primero = new Date(hoy.getFullYear(), hoy.getMonth() + meses, 1, 9, 0, 0, 0);
      await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} mes+${meses}`, fechaInicio: primero, fechaFin: new Date(primero.getTime() + 3_600_000), tipoEvento: 'TALLER' });
    }
  });

  test.afterEach(async ({ page }) => {
    await borrarEventosConTitulo(page, etiqueta);
  });

  for (const tema of TEMAS) {
    test(`vistas Día, Semana y Mes en siete anchos (${tema}): sin desborde, objetivos táctiles, contraste y semántica`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: tema });
      const filas: Fila[] = [];
      for (const [ancho, alto] of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.reload();
        await marcarCalendario(page);
        for (const vista of VISTAS) {
          await page.getByRole('radio', { name: vista }).click();
          await expect(page.getByRole('radio', { name: vista })).toHaveAttribute('aria-checked', 'true');
          // Con datos cargados: en Mes (y bajo sm solo hay puntos) basta la celda de hoy con actividad.
          if (vista === 'Mes') await expect(page.locator('main [aria-current="date"][aria-label*="actividad"]').first()).toBeVisible({ timeout: 15_000 });
          else await expect(page.locator('[data-evento-key]').filter({ hasText: `${etiqueta} reunión` }).first()).toBeVisible({ timeout: 15_000 });
          filas.push(await medir(page, tema, ancho, alto, vista, CALENDARIO, TEXTO_DEL_CALENDARIO));
          if (process.env.G05_EVIDENCIAS) await capturar(page, testInfo, `c13-${tema}-${ancho}-${vista.toLowerCase().replace('í', 'i')}`);
        }
      }
      guardarTabla(testInfo, `c13-tabla-vistas-${tema}`, filas);
      expect(filas).toHaveLength(ANCHOS.length * VISTAS.length);
      expect(sinProblemas(filas)).toEqual([]);
      // Se midió texto de verdad en cada superficie, no una página vacía.
      for (const fila of filas) expect(fila.contrasteMinimo, `${fila.ancho} ${fila.superficie}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });

    test(`diálogos de crear, compartir, detalle y editar en 320, 375 y 1440 px (${tema})`, async ({ page, cspViolations }, testInfo) => {
      await page.emulateMedia({ colorScheme: tema });
      const filas: Fila[] = [];
      const DIALOGO = '[role="dialog"]';
      const TEXTO_DEL_DIALOGO = `${DIALOGO} h2, ${DIALOGO} label, ${DIALOGO} p, ${DIALOGO} [role="radio"], ${DIALOGO} button:not(:disabled), ${DIALOGO} [role="alert"], ${DIALOGO} span.type-meta`;
      const scrollLateral = (dialogo: ReturnType<Page['getByRole']>) =>
        dialogo.evaluate((raiz) => {
          const cuerpo = (raiz.querySelector('.overflow-y-auto') as HTMLElement | null) ?? (raiz as HTMLElement);
          return cuerpo.scrollWidth - cuerpo.clientWidth;
        });
      for (const [ancho, alto] of [ANCHOS[0], ANCHOS[1], ANCHOS[5]]) {
        await page.setViewportSize({ width: ancho, height: alto });

        // Crear: con fecha de fin y modalidad híbrida (enlace + ubicación), el formulario más largo.
        const crear = await abrirNuevoEvento(page);
        await crear.getByRole('checkbox', { name: 'Termina otro día' }).click();
        await crear.getByRole('radio', { name: 'Híbrida' }).click();
        await expect(crear.getByLabel('Ubicación presencial')).toBeVisible();
        await crear.getByRole('button', { name: 'Agendar evento' }).click();
        await expect(crear.getByText('El título no puede estar vacío.')).toBeVisible();
        filas.push(await medir(page, tema, ancho, alto, 'crear (híbrida, varios días, con errores)', DIALOGO, TEXTO_DEL_DIALOGO));
        expect(await scrollLateral(crear), `scroll lateral del formulario a ${ancho}`).toBe(0);
        if (process.env.G05_EVIDENCIAS) await capturar(page, testInfo, `c13-${tema}-${ancho}-dialogo-crear`);
        await page.keyboard.press('Escape');
        await expect(crear).toBeHidden();

        await page.getByRole('button', { name: 'Compartir agenda' }).click();
        const compartir = page.getByRole('dialog', { name: 'Compartir mi agenda' });
        await expect(compartir.getByText(/^Compartida con \(\d+\)$/)).toBeVisible();
        filas.push(await medir(page, tema, ancho, alto, 'compartir', DIALOGO, TEXTO_DEL_DIALOGO));
        if (process.env.G05_EVIDENCIAS) await capturar(page, testInfo, `c13-${tema}-${ancho}-dialogo-compartir`);
        await page.keyboard.press('Escape');
        await expect(compartir).toBeHidden();

        await page.getByRole('radio', { name: 'Día' }).click();
        await page.locator(`[data-evento-key]`).filter({ hasText: `${etiqueta} reunión` }).first().click();
        const detalle = page.getByRole('dialog', { name: `${etiqueta} reunión` });
        await expect(detalle).toBeVisible();
        filas.push(await medir(page, tema, ancho, alto, 'detalle', DIALOGO, TEXTO_DEL_DIALOGO));
        if (process.env.G05_EVIDENCIAS) await capturar(page, testInfo, `c13-${tema}-${ancho}-dialogo-detalle`);
        await detalle.getByRole('button', { name: 'Editar evento' }).click();
        const editar = page.getByRole('dialog', { name: 'Editar evento' });
        await expect(editar.getByLabel('Título del evento o actividad')).toHaveValue(`${etiqueta} reunión`);
        filas.push(await medir(page, tema, ancho, alto, 'editar', DIALOGO, TEXTO_DEL_DIALOGO));
        expect(await scrollLateral(editar), `scroll lateral de la edición a ${ancho}`).toBe(0);
        await editar.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await expect(editar).toBeHidden();
      }
      retirarDeudaCspDelMapa(cspViolations);
      guardarTabla(testInfo, `c13-tabla-dialogos-${tema}`, filas);
      expect(filas).toHaveLength(12);
      // G05.1-C01: sin excepciones. El botón "Eliminar evento" del detalle y de la edición entra en la misma
      // comprobación que el resto del texto (antes era el defecto conocido G05-HALLAZGO-01).
      expect(sinProblemas(filas)).toEqual([]);
      for (const fila of filas) expect(fila.contrasteMinimo, `${fila.ancho} ${fila.superficie}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });

    test(`texto de error y acción destructiva (${tema}): el botón "Eliminar evento" y los mensajes de error del calendario alcanzan 4.5:1`, async ({ page }) => {
      // G05.1-C01 (G05-HALLAZGO-01, corregido): estos textos usaban un color de superficie y medían 1.2–1.3:1
      // en claro y ~2:1 en oscuro. Se mide el color realmente pintado, con alfa y opacidades compuestas.
      await page.emulateMedia({ colorScheme: tema });
      await page.setViewportSize({ width: 1440, height: 900 });
      // Se fuerzan fallos del servidor solo para que la interfaz muestre sus mensajes de error.
      const fallo = (status: number, message: string) => ({ status, contentType: 'application/json', body: JSON.stringify({ statusCode: status, message }) });
      await page.route('**/api/usuarios/me/calendario/compartidos', (ruta) => ruta.fulfill(fallo(500, 'Internal server error')));
      await page.route('**/api/social/usuarios/buscar**', (ruta) => ruta.fulfill(fallo(500, 'Internal server error')));
      let estadoAlCrear = 409;
      await page.route(/\/api\/proyectos\/\d+\/eventos$/, (ruta) => (ruta.request().method() === 'POST' ? ruta.fulfill(fallo(estadoAlCrear, 'Mensaje del servidor')) : ruta.continue()));
      await page.reload();
      const medidas: { donde: string; texto: string; ratio: number }[] = [];
      const medir = async (donde: string, selector: string, minimo = 1) => {
        await esperarAnimaciones(page);
        const encontradas = await medirContraste(page, selector);
        expect(encontradas.length, `texto medido en: ${donde}`).toBeGreaterThanOrEqual(minimo);
        medidas.push(...encontradas.map((m) => ({ donde, texto: m.texto, ratio: m.ratio })));
      };

      // Columna: la lista de calendarios compartidos falló.
      const columna = 'aside[aria-label="Opciones del calendario"]';
      await expect(page.locator(`${columna} [role="alert"]`).first()).toBeVisible({ timeout: 30_000 });
      await medir('columna: lista de compartidos', `${columna} [role="alert"] p`);

      // Diálogo de compartir: su lista y la búsqueda de personas fallan.
      await page.getByRole('button', { name: 'Compartir agenda' }).click();
      const compartir = page.getByRole('dialog', { name: 'Compartir mi agenda' });
      await expect(compartir.getByText('No se pudo cargar con quién compartes tu agenda.')).toBeVisible({ timeout: 30_000 });
      await compartir.getByLabel('Buscar persona').fill('Ana');
      await expect(compartir.getByText(/No se pudo buscar personas/)).toBeVisible({ timeout: 30_000 });
      await medir('compartir: lista y búsqueda', '[role="dialog"] [role="alert"] span', 2);
      await page.keyboard.press('Escape');
      await expect(compartir).toBeHidden();

      // Formulario: la alerta de error del servidor para cada código que el diálogo distingue.
      const formulario = await abrirNuevoEvento(page);
      await formulario.getByLabel('Título del evento o actividad').fill('Demo');
      await formulario.getByLabel('Enlace de conexión virtual').fill('https://meet.google.com/abc-defg-hij');
      const alerta = formulario.locator('[role="alert"][aria-live="assertive"]');
      for (const estado of [400, 403, 404, 409, 500]) {
        estadoAlCrear = estado;
        // Editar un campo retira la alerta anterior; así cada código pinta la suya.
        await formulario.getByLabel('Título del evento o actividad').fill(`Demo ${estado}`);
        await expect(alerta).toHaveCount(0);
        await formulario.getByRole('button', { name: 'Agendar evento' }).click();
        await expect(alerta).toBeVisible();
        // La alerta sigue dentro del diálogo y a la vista.
        expect(await alerta.evaluate((el) => { const a = el.getBoundingClientRect(); const d = (el.closest('[role="dialog"]') as HTMLElement).getBoundingClientRect(); return a.top >= d.top && a.bottom <= d.bottom && a.width > 0; })).toBe(true);
        await medir(`formulario: HTTP ${estado}`, '[role="dialog"] [role="alert"][aria-live="assertive"]');
      }
      // Mensajes de validación junto a los campos, con la alerta del servidor ya retirada.
      await formulario.getByLabel('Título del evento o actividad').fill('');
      await formulario.getByLabel('Enlace de conexión virtual').fill('http://localhost:3000/sala');
      await formulario.getByRole('button', { name: 'Agendar evento' }).click();
      await expect(formulario.getByText('El título no puede estar vacío.')).toBeVisible();
      await medir('formulario: validación por campo', '[role="dialog"] [data-slot="form-message"]', 2);
      await page.keyboard.press('Escape');

      // Botón "Eliminar evento" en el detalle y en la edición.
      await page.getByRole('radio', { name: 'Día' }).click();
      await page.locator('[data-evento-key]').filter({ hasText: `${etiqueta} reunión` }).first().click();
      const detalle = page.getByRole('dialog', { name: `${etiqueta} reunión` });
      await expect(detalle).toBeVisible();
      // Se localiza por rol y nombre y se marca para medirlo (el medidor trabaja con selectores CSS).
      const marcarEliminar = (dialogo: ReturnType<Page['getByRole']>) => dialogo.getByRole('button', { name: 'Eliminar evento' }).evaluate((el) => el.setAttribute('data-e2e-eliminar', ''));
      await marcarEliminar(detalle);
      await medir('detalle: Eliminar evento', '[role="dialog"] [data-e2e-eliminar]');
      await detalle.getByRole('button', { name: 'Editar evento' }).click();
      const edicion = page.getByRole('dialog', { name: 'Editar evento' });
      await expect(edicion).toBeVisible();
      await marcarEliminar(edicion);
      await medir('edición: Eliminar evento', '[role="dialog"] [data-e2e-eliminar]');
      await page.keyboard.press('Escape');

      const carpeta = process.env.G05_EVIDENCIAS;
      if (carpeta) fs.writeFileSync(path.join(carpeta, `c13-contraste-errores-${tema}.json`), JSON.stringify(medidas, null, 1));
      // Ningún texto de la página usa ya el color de superficie de error como color de texto.
      expect(await page.locator('.text-status-error').count()).toBe(0);
      expect(medidas.length).toBeGreaterThanOrEqual(12);
      for (const medida of medidas) expect(medida.ratio, `${medida.donde}: "${medida.texto}"`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });

    test(`contraste de lo atenuado (${tema}): chips en días de otro mes, días vecinos del mini calendario y "hoy"`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload();
      await marcarCalendario(page);
      await page.getByRole('radio', { name: 'Mes' }).click();

      const chipsDeOtroMes: { texto: string; ratio: number }[] = [];
      const numerosDeOtroMes: { texto: string; ratio: number }[] = [];
      // Mes actual y el siguiente: en alguno de los dos, un evento del día 1 queda en una celda de otro mes.
      for (let salto = 0; salto < 2; salto += 1) {
        if (salto === 1) await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
        await page.evaluate(() => {
          for (const celda of document.querySelectorAll<HTMLElement>('main .grid-cols-7 > button[aria-pressed]:not(.h-7)')) celda.dataset.otroMes = celda.className.includes('border-transparent') ? 'si' : 'no';
        });
        chipsDeOtroMes.push(...(await medirContraste(page, 'button[data-otro-mes="si"] span.truncate')));
        numerosDeOtroMes.push(...(await medirContraste(page, 'button[data-otro-mes="si"] > span > span')));
      }
      await page.getByRole('button', { name: 'Hoy', exact: true }).click();
      const lateral = 'aside[aria-label="Opciones del calendario"]';
      await expect(page.locator(`${lateral} button[data-adjacent-month="true"]`).first()).toBeVisible();
      const vecinosDelMini = await medirContraste(page, `${lateral} button[data-adjacent-month="true"]`);
      const hoyDelMini = await medirContraste(page, `${lateral} button[aria-current="date"]`);
      const hoyDelMes = await medirContraste(page, 'main .grid-cols-7 > button[aria-current="date"] > span > span');
      const medidas = { chipsDeOtroMes, numerosDeOtroMes: numerosDeOtroMes.slice(0, 4), vecinosDelMini: vecinosDelMini.slice(0, 4), hoyDelMini, hoyDelMes };
      const carpeta = process.env.G05_EVIDENCIAS;
      if (carpeta) fs.writeFileSync(path.join(carpeta, `c13-contraste-atenuado-${tema}.json`), JSON.stringify(medidas, null, 1));
      void testInfo.attach(`c13-contraste-atenuado-${tema}`, { body: JSON.stringify(medidas, null, 1), contentType: 'application/json' });

      // G05-R02: había chips de eventos en días de otro mes a 2.35:1 (claro) y 3.36:1 (oscuro).
      expect(chipsDeOtroMes.length, 'chips medidos en días de otro mes').toBeGreaterThan(0);
      // G05-R03: los días vecinos del mini calendario estaban en 2.36:1 (claro) y 3.26:1 (oscuro).
      expect(vecinosDelMini.length, 'días vecinos medidos en el mini calendario').toBeGreaterThan(0);
      expect(hoyDelMini).toHaveLength(1);
      for (const [nombre, lista] of Object.entries({ chipsDeOtroMes, numerosDeOtroMes, vecinosDelMini, hoyDelMini, hoyDelMes })) {
        for (const medida of lista) expect(medida.ratio, `${nombre}: "${medida.texto}"`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      }
    });
  }

  test('G05-HALLAZGO-02: la cuadrícula por horas de un día sin eventos se puede alcanzar y desplazar con teclado', async ({ page }) => {
    // Fallo esperado y documentado: hoy NO se cumple. La cuadrícula es una región con scroll (24 horas en
    // 34rem) que, sin eventos, no contiene nada enfocable ni es enfocable ella misma: quien usa teclado no
    // puede ver las horas que quedan fuera (axe: scrollable-region-focusable, serio; WCAG 2.1.1). Cuando el
    // contenedor reciba tabindex y nombre, Playwright avisará de que esta prueba pasó: se quita la anotación.
    test.fail(true, 'G05-HALLAZGO-02: región con scroll sin contenido enfocable (WCAG 2.1.1)');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('radio', { name: 'Día' }).click();
    // Veinte días adelante: fuera de los eventos de esta prueba y del seed.
    for (let i = 0; i < 20; i += 1) await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    const cuadricula = page.getByTestId('cuadricula-horas');
    await expect(cuadricula).toBeVisible();
    const estado = await cuadricula.evaluate((el) => ({
      conScroll: el.scrollHeight > el.clientHeight + 1,
      enfocable: (el as HTMLElement).tabIndex >= 0,
      contenidoEnfocable: el.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])').length,
    }));
    expect(estado.conScroll).toBe(true);
    expect(estado.enfocable || estado.contenidoEnfocable > 0, JSON.stringify(estado)).toBe(true);
  });

  test('con teclado, el foco es visible en los controles del calendario y los diálogos atrapan y devuelven el foco', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await marcarCalendario(page);
    /** ¿El elemento enfocado por teclado tiene un indicador visible (contorno o sombra de foco)? */
    const indicador = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const estilo = getComputedStyle(el);
        const contorno = estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0;
        return { nombre: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), visible: contorno || estilo.boxShadow !== 'none' };
      });
    const sinIndicador: string[] = [];
    await page.getByRole('button', { name: 'Compartir agenda' }).focus();
    // Recorrido con Tab por la cabecera, la barra y la columna del calendario.
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      const dentro = await page.evaluate((sel) => document.querySelector(sel)?.contains(document.activeElement) ?? false, CALENDARIO);
      if (!dentro) break;
      const estado = await indicador();
      if (!estado.visible) sinIndicador.push(estado.nombre);
    }
    expect(sinIndicador).toEqual([]);

    // Un diálogo abierto atrapa el Tab: tras muchas pulsaciones el foco sigue dentro.
    await page.getByRole('button', { name: 'Agendar actividad' }).focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
    await expect(dialogo).toBeVisible();
    for (let i = 0; i < 30; i += 1) await page.keyboard.press('Tab');
    expect(await dialogo.evaluate((raiz) => raiz.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+Tab');
    expect(await dialogo.evaluate((raiz) => raiz.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('button', { name: 'Agendar actividad' })).toBeFocused();
  });
});
