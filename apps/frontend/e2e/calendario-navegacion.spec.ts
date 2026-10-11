import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import {
  CORREO_INVITADA,
  abrirNuevoEvento,
  api,
  borrarEventosConTitulo,
  capturar,
  crearEventoPorApi,
  enDias,
  flecha,
  focoActual,
  idDelProyecto,
  mananaTemprano,
  retirarDeudaCspDelMapa,
} from './support/calendario';

// G02-C14 (UI-02, UI-04, T-324): la semana es legible en cada ancho y la página nunca desborda.
const CORREO = 'carlos.mendoza@uvg.edu.gt';

async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

const overflowHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Calendario: semana legible por ancho y tema (HU-184, G02)', () => {
  test.beforeEach(async ({ page }) => {
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO);
  });

  for (const [ancho, esperaCuadricula] of [
    [375, false],
    [1024, false],
    [1440, true],
  ] as const) {
    test(`en ${ancho} px la semana usa ${esperaCuadricula ? 'la cuadrícula por horas' : 'la lista de días'} sin desbordar la página`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto('/dashboard/calendario');
      await expect(page.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
      const cuadricula = page.getByTestId('cuadricula-horas');
      if (esperaCuadricula) {
        await expect(cuadricula).toBeVisible();
      } else {
        await expect(cuadricula).toBeHidden();
      }
      expect(await overflowHorizontal(page)).toBe(0);

      await page.getByRole('radio', { name: 'Día' }).click();
      await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
      expect(await overflowHorizontal(page)).toBe(0);
      await page.getByRole('radio', { name: 'Mes' }).click();
      expect(await overflowHorizontal(page)).toBe(0);
    });
  }

  test('en tema oscuro las vistas Día y Semana se dibujan sin desbordar y conservan la navegación', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/calendario');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
    expect(await overflowHorizontal(page)).toBe(0);
    await page.getByRole('radio', { name: 'Día' }).click();
    await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
    expect(await overflowHorizontal(page)).toBe(0);
  });
});

/**
 * G05-C12 (T-324, UI-02, UI-04, UI-05, UI-10): navegación, eventos cortos y
 * solapados, franja "Todo el día", teclado y foco, en navegador real contra el
 * stack real. Los eventos de cada prueba se crean por la API y se borran al
 * terminar. "Hoy" para el navegador es mañana a las 08:00 (reloj fijo).
 */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const periodo = (page: Page) => page.locator('h2[aria-live="polite"]');
const lunesDe = (fecha: Date) => {
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  return lunes;
};
/** Lleva la vista Semana o Día desde hoy hasta la fecha indicada pulsando "Siguiente". */
async function avanzarHasta(page: Page, vista: 'Día' | 'Semana', fecha: Date) {
  const hoy = mananaTemprano();
  const pasos = vista === 'Día' ? Math.round((new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000) : Math.round((lunesDe(fecha).getTime() - lunesDe(hoy).getTime()) / (7 * 86_400_000));
  for (let i = 0; i < pasos; i += 1) await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
}

test.describe('Calendario: navegación, eventos cortos y teclado (HU-184, G05-C12)', () => {
  let etiqueta = '';
  let idProyecto = 0;

  test.beforeEach(async ({ page }, testInfo) => {
    etiqueta = `E2E-C12-${Date.now()}-${testInfo.retry}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/calendario');
    idProyecto = await idDelProyecto(page);
    // Punto de partida conocido aunque una corrida anterior se haya interrumpido antes de limpiar.
    await borrarEventosConTitulo(page, 'E2E-C12-');
  });

  test.afterEach(async ({ page }) => {
    await borrarEventosConTitulo(page, etiqueta);
  });

  test('Día, Semana, Mes y Hoy: el encabezado sigue a la navegación y el mini calendario lleva a la fecha elegida', async ({ page }) => {
    const hoy = mananaTemprano();
    await expect(page.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
    const semanaInicial = await periodo(page).textContent();

    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(periodo(page)).not.toHaveText(semanaInicial as string);
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await expect(periodo(page)).toHaveText(semanaInicial as string);

    await page.getByRole('radio', { name: 'Mes' }).click();
    await expect(periodo(page)).toContainText(`${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`);
    await expect(page.locator('main [aria-current="date"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    const siguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    await expect(periodo(page)).toContainText(`${MESES[siguiente.getMonth()]} ${siguiente.getFullYear()}`);
    // Fuera del mes de hoy no hay ningún "hoy" marcado en la rejilla grande (salvo que caiga en la cuadrícula).
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(periodo(page)).toContainText(`${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`);

    await page.getByRole('radio', { name: 'Día' }).click();
    await expect(periodo(page)).toContainText(String(hoy.getFullYear()));
    await expect(page.getByTestId('cuadricula-horas')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    await expect(periodo(page)).toContainText(`${manana.getDate()} de ${MESES[manana.getMonth()].toLowerCase()}`);

    // Mini calendario: elegir un día del mes mostrado lleva la vista Día a esa fecha y lo marca como presionado.
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    const lateral = page.getByRole('complementary', { name: 'Opciones del calendario' });
    const objetivo = hoy.getDate() <= 14 ? hoy.getDate() + 7 : hoy.getDate() - 7;
    const celda = lateral.locator('button[aria-pressed]:not([data-adjacent-month])').filter({ hasText: new RegExp(`^${objetivo}$`) });
    await celda.click();
    await expect(periodo(page)).toContainText(`${objetivo} de ${MESES[hoy.getMonth()].toLowerCase()}`);
    await expect(celda).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/dashboard\/calendario$/);
    expect(await overflowHorizontal(page)).toBe(0);
  });

  test('un evento de 15 minutos se lee y se puede abrir en Día y en Semana', async ({ page }) => {
    const titulo = `${etiqueta} corto`;
    await crearEventoPorApi(page, idProyecto, { tituloEvento: titulo, fechaInicio: enDias(1, 9, 0), fechaFin: enDias(1, 9, 15) });
    await page.reload();
    for (const vista of ['Semana', 'Día'] as const) {
      await page.getByRole('radio', { name: vista }).click();
      await avanzarHasta(page, vista, enDias(1, 9));
      const bloque = page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 09:15`) });
      await expect(bloque).toBeVisible({ timeout: 15_000 });
      await expect(bloque).toContainText(titulo.slice(0, 8));
      const caja = await bloque.boundingBox();
      expect(caja && caja.height, 'alto del bloque de 15 minutos').toBeGreaterThanOrEqual(24);
      await bloque.click();
      const detalle = page.getByRole('dialog', { name: titulo });
      await expect(detalle.getByText(/09:00–09:15|09:00 – 09:15/)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detalle).toBeHidden();
      await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    }
  });

  test('cuatro eventos a la misma hora: en Semana se resumen en "+N" que lleva al día, donde están los cuatro', async ({ page }) => {
    for (let i = 1; i <= 4; i += 1) {
      await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} solapado ${i}`, fechaInicio: enDias(2, 10), fechaFin: enDias(2, 11) });
    }
    await page.reload();
    await avanzarHasta(page, 'Semana', enDias(2, 10));
    const resumen = page.getByRole('button', { name: /eventos más a esta hora, ver el día/ });
    await expect(resumen).toBeVisible({ timeout: 15_000 });
    // Lo visible más lo resumido suma los cuatro: ninguno se pierde.
    const visibles = await page.getByRole('button', { name: new RegExp(`^${etiqueta} solapado \\d, 10:00 a 11:00`) }).count();
    const ocultos = Number(((await resumen.getAttribute('aria-label')) as string).match(/^(\d+)/)?.[1]);
    expect(visibles + ocultos).toBe(4);
    expect(await overflowHorizontal(page)).toBe(0);

    await resumen.click();
    await expect(page.getByRole('radio', { name: 'Día' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: new RegExp(`^${etiqueta} solapado \\d, 10:00 a 11:00`) })).toHaveCount(4, { timeout: 15_000 });
    for (let i = 1; i <= 4; i += 1) await expect(page.getByRole('button', { name: new RegExp(`^${etiqueta} solapado ${i},`) })).toBeVisible();
  });

  test('cuatro actividades de todo el día: Semana muestra tres y "+1 más"; al abrir el día están las cuatro', async ({ page }) => {
    // Eventos de tres días: el día de en medio los lleva completos en la franja "Todo el día".
    for (let i = 1; i <= 4; i += 1) {
      await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} largo ${i}`, fechaInicio: enDias(8, 9), fechaFin: enDias(10, 10), tipoEvento: 'ENTREGA' });
    }
    const medio = enDias(9, 12);
    await page.reload();
    await avanzarHasta(page, 'Semana', medio);
    const mas = page.getByRole('button', { name: /actividad(es)? más de todo el día, ver el día/ });
    // Si los tres días caen en la misma semana, el del medio resume una; si la semana corta el evento, se navega al día igualmente.
    if ((await mas.count()) > 0) {
      await expect(mas.first()).toHaveAccessibleName(/^1 actividad más de todo el día/);
      // Tres visibles y una resumida: en la columna de ese día no se pierde ninguna.
      expect(await overflowHorizontal(page)).toBe(0);
    }
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await page.getByRole('radio', { name: 'Día' }).click();
    await avanzarHasta(page, 'Día', medio);
    await expect(page.getByText('Todo el día')).toBeVisible();
    for (let i = 1; i <= 4; i += 1) await expect(page.getByText(`${etiqueta} largo ${i}`).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /más de todo el día/ })).toHaveCount(0);
  });

  test('el filtro por tipo oculta y devuelve los eventos de ese tipo, y el contador lo refleja', async ({ page }) => {
    await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} revision`, fechaInicio: enDias(1, 9), fechaFin: enDias(1, 10), tipoEvento: 'REVISION' });
    await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} taller`, fechaInicio: enDias(1, 11), fechaFin: enDias(1, 12), tipoEvento: 'TALLER' });
    await page.reload();
    await page.getByRole('radio', { name: 'Día' }).click();
    await avanzarHasta(page, 'Día', enDias(1, 9));
    const revision = page.getByRole('button', { name: new RegExp(`^${etiqueta} revision,`) });
    const taller = page.getByRole('button', { name: new RegExp(`^${etiqueta} taller,`) });
    await expect(revision).toBeVisible({ timeout: 15_000 });
    await expect(taller).toBeVisible();

    const filtro = page.getByRole('button', { name: /Todos los eventos|Eventos filtrados/ });
    await expect(filtro).toContainText('Todos los eventos');
    await filtro.click();
    await page.getByRole('menuitemcheckbox', { name: 'Revisión' }).click();
    await page.keyboard.press('Escape');
    await expect(revision).toHaveCount(0);
    await expect(taller).toBeVisible();
    await expect(filtro).toContainText('Eventos filtrados');
    await filtro.click();
    await page.getByRole('menuitem', { name: 'Mostrar todo' }).click();
    await expect(revision).toBeVisible();
    await expect(filtro).toContainText('Todos los eventos');
  });

  test('teclado: flechas en el selector de vista, menú de filtros recorrible y foco de vuelta al cerrar cada diálogo', async ({ page, cspViolations }) => {
    const titulo = `${etiqueta} foco`;
    await crearEventoPorApi(page, idProyecto, { tituloEvento: titulo, fechaInicio: enDias(0, 9), fechaFin: enDias(0, 10) });
    await page.reload();

    // Selector de vista: una sola parada de tabulación y flechas para cambiar.
    const vista = (nombre: string) => page.getByRole('radio', { name: nombre });
    await vista('Semana').focus();
    await expect(vista('Semana')).toBeFocused();
    await flecha(page, 'ArrowRight');
    await expect(vista('Mes')).toHaveAttribute('aria-checked', 'true');
    await expect(vista('Mes')).toBeFocused();
    await flecha(page, 'ArrowLeft');
    await expect(vista('Semana')).toHaveAttribute('aria-checked', 'true');
    await flecha(page, 'ArrowLeft');
    await expect(vista('Día')).toHaveAttribute('aria-checked', 'true');
    expect(await page.getByRole('radiogroup', { name: 'Vista del calendario' }).getByRole('radio').evaluateAll((radios) => radios.filter((r) => (r as HTMLElement).tabIndex === 0).length)).toBe(1);
    await page.keyboard.press('Tab');
    expect(await focoActual(page)).not.toMatch(/^radio:/);

    // Menú de filtros: Enter abre, las flechas recorren, Escape cierra y devuelve el foco al botón.
    const filtro = page.getByRole('button', { name: /Todos los eventos/ });
    await filtro.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    // El foco itinerante del menú se mueve de forma asíncrona: se espera a cada cambio en vez de leerlo al instante.
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focoActual(page)).toMatch(/^menuitemcheckbox:/);
    const primera = await focoActual(page);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focoActual(page)).not.toBe(primera);
    expect(await focoActual(page)).toMatch(/^menuitemcheckbox:/);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focoActual(page)).toBe(primera);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(filtro).toBeFocused();

    // Detalle de un evento abierto con Enter: Escape devuelve el foco al bloque.
    const bloque = page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) });
    await expect(bloque).toBeVisible({ timeout: 15_000 });
    await bloque.focus();
    await page.keyboard.press('Enter');
    const detalle = page.getByRole('dialog', { name: titulo });
    await expect(detalle).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detalle).toBeHidden();
    await expect(bloque).toBeFocused();

    // Detalle → Editar → Cancelar (D-17): el foco vuelve al mismo bloque, no a <body>.
    await page.keyboard.press('Enter');
    await detalle.getByRole('button', { name: 'Editar evento' }).click();
    const edicion = page.getByRole('dialog', { name: 'Editar evento' });
    await expect(edicion).toBeVisible();
    await edicion.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(edicion).toBeHidden();
    await expect(bloque).toBeFocused();

    // Diálogos de la barra (G04-R01): Escape, la X y Cancelar devuelven el foco al botón que los abrió.
    const agendar = page.getByRole('button', { name: 'Agendar actividad' });
    for (const cerrar of ['Escape', 'X', 'Cancelar'] as const) {
      await agendar.focus();
      await page.keyboard.press('Enter');
      const nuevo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
      await expect(nuevo).toBeVisible();
      if (cerrar === 'Escape') await page.keyboard.press('Escape');
      else if (cerrar === 'X') await nuevo.getByRole('button', { name: /^(Close|Cerrar)$/ }).click();
      else await nuevo.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(nuevo).toBeHidden();
      await expect(agendar, `foco tras cerrar con ${cerrar}`).toBeFocused();
    }
    const compartir = page.getByRole('button', { name: 'Compartir agenda' });
    await compartir.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Compartir mi agenda' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Compartir mi agenda' })).toBeHidden();
    await expect(compartir).toBeFocused();

    // Modalidad del formulario: flechas con aria-checked real.
    await agendar.click();
    const nuevo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
    const modalidad = (nombre: string) => nuevo.getByRole('radio', { name: nombre });
    await modalidad('Virtual').focus();
    await flecha(page, 'ArrowRight');
    await expect(modalidad('Híbrida')).toHaveAttribute('aria-checked', 'true');
    await flecha(page, 'ArrowLeft');
    await flecha(page, 'ArrowLeft');
    await expect(modalidad('Presencial')).toHaveAttribute('aria-checked', 'true');
    // Híbrida y Presencial montan el mapa: su deuda CSP conocida se retira de forma explícita.
    await expect(nuevo.getByLabel('Ubicación presencial')).toBeVisible();
    await page.keyboard.press('Escape');
    retirarDeudaCspDelMapa(cspViolations);
  });

  for (const [ancho, alto] of [
    [320, 568],
    [375, 900],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`en ${ancho}×${alto} ninguna vista ni el diálogo desbordan en horizontal y la semana usa una sola representación`, async ({ page }, testInfo) => {
      await crearEventoPorApi(page, idProyecto, { tituloEvento: `${etiqueta} ancho`, fechaInicio: enDias(0, 9), fechaFin: enDias(0, 10) });
      await page.setViewportSize({ width: ancho, height: alto });
      await page.reload();
      for (const vista of ['Semana', 'Día', 'Mes'] as const) {
        await page.getByRole('radio', { name: vista }).click();
        await expect(page.getByRole('radio', { name: vista })).toHaveAttribute('aria-checked', 'true');
        expect(await overflowHorizontal(page), `desborde en ${vista}`).toBe(0);
        if (vista === 'Semana') {
          // Una sola representación montada: cuadrícula desde 1280 px, lista de días por debajo.
          expect(await page.getByTestId('cuadricula-semana').count()).toBe(ancho >= 1280 ? 1 : 0);
          await expect(page.getByText(`${etiqueta} ancho`).first()).toBeVisible({ timeout: 15_000 });
          if (ancho === 768 || ancho === 1024) await capturar(page, testInfo, `c12-semana-${ancho}`);
        }
      }
      // Ningún control del calendario (título, barra, columna, vistas) queda fuera de la ventana. Se mide desde el
      // contenedor de la página del calendario: la cabecera general de la aplicación no es parte de este PR.
      const fuera = await page.evaluate(() => {
        const titulo = document.querySelector('h1') as HTMLElement;
        const vistas = document.querySelector('[role="radiogroup"][aria-label="Vista del calendario"]') as HTMLElement;
        let raiz: HTMLElement = titulo;
        while (!raiz.contains(vistas)) raiz = raiz.parentElement as HTMLElement;
        return [...raiz.querySelectorAll<HTMLElement>('button, a[href], [role="radio"], [role="checkbox"]')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5); })
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40));
      });
      expect(fuera).toEqual([]);

      const dialogo = await abrirNuevoEvento(page);
      await dialogo.getByRole('checkbox', { name: 'Termina otro día' }).click();
      const medidas = await dialogo.evaluate((raiz) => {
        const cuerpo = raiz.querySelector('.overflow-y-auto') as HTMLElement;
        const caja = raiz.getBoundingClientRect();
        return {
          scrollLateral: cuerpo.scrollWidth - cuerpo.clientWidth,
          dentroDeLaVentana: caja.left >= 0 && caja.right <= window.innerWidth,
          etiquetasCortadas: [...raiz.querySelectorAll('[role="radiogroup"] [role="radio"] span')].filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent),
        };
      });
      expect(medidas).toEqual({ scrollLateral: 0, dentroDeLaVentana: true, etiquetasCortadas: [] });
      expect(await overflowHorizontal(page)).toBe(0);
      if (ancho === 320) await capturar(page, testInfo, 'c12-dialogo-320');
    });
  }
});

test.describe('Calendario: abrir un calendario compartido desde su aviso (HU-184, G05-C12, UI-40)', () => {
  test('el enlace del aviso activa el calendario de quien compartió y deja la dirección limpia; un id ajeno no activa nada', async ({ page, browser }) => {
    await login(page, CORREO);
    await page.goto('/dashboard/calendario');
    const yo = (await (await api(page, 'get', '/api/usuarios/me')).json()) as { idUsuario: number };
    const equipo = (await (await api(page, 'get', `/api/proyectos/${await idDelProyecto(page)}/equipo`)).json()) as { usuario: { idUsuario: number; correo: string } }[];
    const idMaria = (equipo.find((m) => m.usuario.correo === CORREO_INVITADA) as { usuario: { idUsuario: number } }).usuario.idUsuario;
    await api(page, 'delete', `/api/usuarios/me/calendario/compartidos/${idMaria}`);
    // Una compartición por la API real (cuenta para el límite de 5 por minuto de esa cuenta).
    expect((await api(page, 'post', '/api/usuarios/me/calendario/compartidos', { idUsuario: idMaria })).status()).toBe(201);

    const contexto = await browser.newContext();
    try {
      const maria = await contexto.newPage();
      await login(maria, CORREO_INVITADA);
      // El límite global de la API es por IP (50 peticiones cada 10 s) y en este stack todo sale del mismo
      // servidor Next: tras las pruebas anteriores se deja pasar una ventana completa para que la carga de
      // la página de María no reciba un 429 ajeno a lo que aquí se comprueba.
      await maria.waitForTimeout(10_500);
      await maria.goto('/dashboard/calendario');
      await maria.evaluate((clave) => localStorage.removeItem(clave), `calendario:compartidos-activos:${idMaria}`);

      await maria.goto(`/dashboard/calendario?compartido=${yo.idUsuario}`);
      const casilla = maria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' });
      await expect(casilla).toBeChecked({ timeout: 15_000 });
      await expect(maria).toHaveURL(/\/dashboard\/calendario$/);
      expect(JSON.parse((await maria.evaluate((clave) => localStorage.getItem(clave), `calendario:compartidos-activos:${idMaria}`)) ?? '[]')).toEqual([yo.idUsuario]);

      // Un id que nadie le compartió: no se activa nada, no se guarda y la dirección queda limpia.
      await casilla.click();
      await expect(casilla).not.toBeChecked();
      const pedidas: string[] = [];
      maria.on('request', (r) => { if (/compartidos-conmigo\/\d+\/agenda/.test(r.url())) pedidas.push(r.url()); });
      await maria.goto('/dashboard/calendario?compartido=999999');
      await expect(maria).toHaveURL(/\/dashboard\/calendario$/);
      await expect(casilla).not.toBeChecked();
      expect(pedidas.filter((u) => u.includes('/999999/'))).toEqual([]);
      expect(JSON.parse((await maria.evaluate((clave) => localStorage.getItem(clave), `calendario:compartidos-activos:${idMaria}`)) ?? '[]')).toEqual([]);
    } finally {
      await contexto.close();
      await api(page, 'delete', `/api/usuarios/me/calendario/compartidos/${idMaria}`);
    }
  });
});
