import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';

// carlos.mendoza lidera "Portal de Empleo UVG" (Proyecto 5 del seed), donde
// maria.lopez NO participa (ella solo está en el Proyecto 1). G01 (UI-01):
// por eso María, aunque Carlos le comparta su agenda, solo puede ver ese
// evento como "Ocupado" (horario sin título, proyecto, link ni descripción).
const CORREO_PROPIETARIO = 'carlos.mendoza@uvg.edu.gt';
const CORREO_INVITADA = 'maria.lopez@uvg.edu.gt';
const PROYECTO_AJENO = 'Portal de Empleo UVG';
const LINK_PRIVADO = 'https://meet.google.com/e2e-compartido';
const DESCRIPCION_PRIVADA = 'SECRETO E2E: notas privadas del proyecto';
const RUTA_AGENDA = /\/api\/usuarios\/me\/calendario\/compartidos-conmigo\/\d+\/agenda/;

async function fijarRelojMananaTemprano(page: Page) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  await page.clock.setFixedTime(manana);
}

async function crearEvento(page: Page, titulo: string) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('button', { name: 'Agendar actividad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
  await dialogo.getByLabel('Proyecto', { exact: true }).click();
  await page.getByRole('option', { name: PROYECTO_AJENO }).click();
  await dialogo.getByLabel('Título del evento o actividad').fill(titulo);
  await dialogo.getByRole('button', { name: 'Agregar descripción' }).click();
  await dialogo.getByLabel('Descripción (opcional)').fill(DESCRIPCION_PRIVADA);
  await dialogo.getByLabel('Enlace de conexión virtual').fill(LINK_PRIVADO);
  await dialogo.getByRole('button', { name: 'Agendar evento' }).click();
  await expect(page.getByText('Evento agendado')).toBeVisible();
}

async function abrirCompartir(page: Page) {
  await page.getByRole('button', { name: 'Compartir agenda' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Compartir mi agenda' });
  await expect(dialogo.getByText(/^Compartida con \(\d+\)$/)).toBeVisible();
  return dialogo;
}

async function eliminarEvento(page: Page, titulo: string) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('radio', { name: 'Día' }).click();
  await page.getByRole('button', { name: new RegExp(`^${titulo}, 09:00 a 10:00`) }).click();
  await page.getByRole('dialog', { name: titulo }).getByRole('button', { name: 'Eliminar evento' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).click();
  await expect(page.getByText('Evento eliminado')).toBeVisible();
}

test.describe('Calendario: compartir agenda (HU-184, G01 UI-01/UI-31)', () => {
  test('la agenda compartida solo expone disponibilidad de proyectos ajenos y el receptor puede quitársela', async ({ page, browser }) => {
    const titulo = `E2E compartido ${Date.now()}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_PROPIETARIO);
    await crearEvento(page, titulo);

    try {
      // Compartir con María (si una corrida anterior la dejó compartida, se quita primero).
      let compartir = await abrirCompartir(page);
      const quitarPrevio = compartir.getByRole('button', { name: 'Dejar de compartir con María López' });
      if ((await quitarPrevio.count()) > 0) {
        await quitarPrevio.click();
        await expect(quitarPrevio).toHaveCount(0);
      }
      await compartir.getByLabel('Buscar persona').fill('María');
      await compartir.getByRole('button', { name: 'Compartir con María López' }).click();
      await expect(page.getByText('Agenda compartida')).toBeVisible();
      await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(compartir).toBeHidden();

      const contexto = await browser.newContext();
      const paginaMaria = await contexto.newPage();
      try {
        await fijarRelojMananaTemprano(paginaMaria);
        await login(paginaMaria, CORREO_INVITADA);
        await paginaMaria.goto('/dashboard/calendario');
        await paginaMaria.getByRole('radio', { name: 'Día' }).click();

        // Antes de activar el calendario de Carlos no hay nada suyo en pantalla.
        const bloque = paginaMaria.getByRole('button', { name: /^Ocupado, 09:00 a 10:00, calendario de Carlos Mendoza/ });
        await expect(bloque).toHaveCount(0);

        // G01 (UI-01): el JSON de red de la agenda compartida es el contrato mínimo, no el evento completo.
        const respuesta = paginaMaria.waitForResponse((r) => RUTA_AGENDA.test(r.url()) && r.request().method() === 'GET');
        await paginaMaria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' }).click();
        const agenda = await respuesta;
        expect(agenda.status()).toBe(200);
        const cuerpo = await agenda.text();
        for (const privado of [titulo, LINK_PRIVADO, DESCRIPCION_PRIVADA, PROYECTO_AJENO, 'linkSesion', 'descripcionEvento', 'invitados']) {
          expect(cuerpo).not.toContain(privado);
        }
        const json = JSON.parse(cuerpo) as { eventos: { visibilidad: string; tituloEvento?: string }[] };
        expect(json.eventos.some((e) => e.visibilidad === 'OCUPADO')).toBe(true);
        expect(json.eventos.every((e) => e.visibilidad !== 'OCUPADO' || e.tituloEvento === undefined)).toBe(true);

        // En pantalla: solo "Ocupado" y el horario; el detalle no muestra nada privado.
        await expect(bloque).toBeVisible({ timeout: 15_000 });
        await bloque.click();
        const detalle = paginaMaria.getByRole('dialog', { name: 'Ocupado' });
        await expect(detalle.getByText('Calendario de Carlos Mendoza · solo lectura')).toBeVisible();
        await expect(detalle.getByText(titulo)).toHaveCount(0);
        await expect(detalle.getByText('Link de la sesión')).toHaveCount(0);
        await expect(detalle.getByText('Descripción')).toHaveCount(0);
        await expect(detalle.getByText(PROYECTO_AJENO)).toHaveCount(0);
        await expect(detalle.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
        await expect(detalle.getByRole('button', { name: 'Eliminar evento' })).toHaveCount(0);
        await paginaMaria.keyboard.press('Escape');

        // G01 (UI-31): María se quita el calendario; después el backend le niega la agenda.
        await paginaMaria.getByRole('button', { name: 'Quitar el calendario de Carlos Mendoza' }).click();
        await expect(paginaMaria.getByText('Calendario quitado')).toBeVisible();
        await expect(paginaMaria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' })).toHaveCount(0);
        await expect(bloque).toHaveCount(0);
        const idPropietario = agenda.url().match(/compartidos-conmigo\/(\d+)\/agenda/)?.[1];
        const denegada = await paginaMaria.request.get(
          `/api/usuarios/me/calendario/compartidos-conmigo/${idPropietario}/agenda?desde=${encodeURIComponent(new Date().toISOString())}&hasta=${encodeURIComponent(new Date(Date.now() + 7 * 86_400_000).toISOString())}`,
        );
        expect(denegada.status()).toBe(403);
      } finally {
        await contexto.close();
      }

      // Carlos ya no la ve en "Compartida con" (la revocación fue de María). G05-C11 (clase B): esta
      // prueba nunca se había ejecutado contra el stack real; ahí se vio que la lista de Carlos, ya cargada
      // en su pestaña, no se entera sola de una baja hecha desde otra sesión. Se recarga, que es lo que
      // el plan pide comprobar; que el diálogo no refresque al abrirse queda registrado en la auditoría.
      await page.reload();
      compartir = await abrirCompartir(page);
      await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toHaveCount(0);
      await page.keyboard.press('Escape');
    } finally {
      // Limpieza: el evento de prueba no se queda en la base.
      await eliminarEvento(page, titulo);
    }
  });
});

/**
 * G05-C11 (UI-01, UI-15, UI-31): privacidad y revocación de extremo a extremo
 * con las tres formas en que un evento del propietario puede llegar (o no) a
 * quien recibe su calendario. Los eventos se crean por la API real; compartir,
 * ver y revocar se hace en la interfaz, con dos sesiones reales.
 *
 *   Proyecto 1 (María participa)        sin invitados   → DETALLE
 *   Proyecto 1                          solo para José  → no llega
 *   Proyecto 5 (María no participa)     sin invitados   → OCUPADO
 *   Proyecto 5                          solo para Luis  → no llega
 */
const PROYECTO_COMUN = 'Plataforma de Tutorías UVG';
const CLAVES_OCUPADO = ['fechaFin', 'fechaInicio', 'idEvento', 'visibilidad'];
const CLAVES_DETALLE = ['fechaFin', 'fechaInicio', 'idEvento', 'modalidad', 'proyecto', 'tipoEvento', 'tituloEvento', 'visibilidad'];

interface Escenario {
  marca: string;
  idMaria: number;
  idCarlos: number;
  ids: { comun: number; comunRestringido: number; ajeno: number; ajenoRestringido: number };
  secretos: string[];
}

async function prepararEscenario(page: Page, marca: string): Promise<Escenario> {
  const proyectos = (await (await page.request.get('/api/proyectos/mine')).json()) as { idProyecto: number; tituloProyecto: string }[];
  const idDe = (titulo: string) => (proyectos.find((p) => p.tituloProyecto === titulo) as { idProyecto: number }).idProyecto;
  const equipo = async (idProyecto: number) =>
    (await (await page.request.get(`/api/proyectos/${idProyecto}/equipo`)).json()) as { usuario: { idUsuario: number; correo: string } }[];
  const idUsuario = (lista: { usuario: { idUsuario: number; correo: string } }[], correo: string) =>
    (lista.find((m) => m.usuario.correo === correo) as { usuario: { idUsuario: number } }).usuario.idUsuario;
  const comun = idDe(PROYECTO_COMUN);
  const ajeno = idDe(PROYECTO_AJENO);
  const equipoComun = await equipo(comun);
  const equipoAjeno = await equipo(ajeno);
  const yo = (await (await page.request.get('/api/usuarios/me')).json()) as { idUsuario: number };

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const a = (hora: number) => new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), hora, 0, 0, 0).toISOString();
  const crear = async (idProyecto: number, nombre: string, hora: number, invitados: number[]) => {
    const respuesta = await page.request.post(`/api/proyectos/${idProyecto}/eventos`, {
      data: {
        tituloEvento: `${marca} ${nombre}`,
        descripcionEvento: `SECRETO-${nombre}-${marca}`,
        fechaInicio: a(hora),
        fechaFin: a(hora + 1),
        modalidad: 'VIRTUAL',
        linkSesion: `https://meet.google.com/secreto-${nombre}`,
        tipoEvento: 'REVISION',
        invitados,
      },
    });
    expect(respuesta.status(), `crear ${nombre}`).toBe(201);
    return ((await respuesta.json()) as { idEvento: number }).idEvento;
  };
  const ids = {
    comun: await crear(comun, 'comun', 9, []),
    comunRestringido: await crear(comun, 'comunrestringido', 11, [idUsuario(equipoComun, 'jose.ramirez@uvg.edu.gt')]),
    ajeno: await crear(ajeno, 'ajeno', 13, []),
    ajenoRestringido: await crear(ajeno, 'ajenorestringido', 15, [idUsuario(equipoAjeno, 'luis.hernandez@uvg.edu.gt')]),
  };
  return {
    marca,
    idMaria: idUsuario(equipoComun, CORREO_INVITADA),
    idCarlos: yo.idUsuario,
    ids,
    // Nada de lo ajeno o restringido puede llegar a María, ni por la agenda compartida ni por su propio calendario.
    secretos: ['comunrestringido', 'ajeno', 'ajenorestringido'].flatMap((n) => [`${marca} ${n}`, `SECRETO-${n}-${marca}`, `secreto-${n}`]),
  };
}

async function limpiarEscenario(page: Page, marca: string, idMaria?: number) {
  if (idMaria) await page.request.delete(`/api/usuarios/me/calendario/compartidos/${idMaria}`);
  const hoy = Date.now();
  const rango = `desde=${encodeURIComponent(new Date(hoy - 3 * 86_400_000).toISOString())}&hasta=${encodeURIComponent(new Date(hoy + 10 * 86_400_000).toISOString())}`;
  const eventos = (await (await page.request.get(`/api/usuarios/me/eventos?${rango}`)).json()) as { idEvento: number; idProyecto: number; tituloEvento: string }[];
  for (const evento of eventos.filter((e) => e.tituloEvento.startsWith(marca))) await page.request.delete(`/api/proyectos/${evento.idProyecto}/eventos/${evento.idEvento}`);
}

async function compartirConMaria(page: Page) {
  const compartir = await abrirCompartir(page);
  await compartir.getByLabel('Buscar persona').fill('María');
  await compartir.getByRole('button', { name: 'Compartir con María López' }).click();
  await expect(page.getByText('Agenda compartida')).toBeVisible();
  await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(compartir).toBeHidden();
}

/** Todo lo que el navegador de esa sesión recibe de la API, para buscar fugas en cualquier respuesta. */
function registrarRespuestas(page: Page) {
  const cuerpos: { ruta: string; cuerpo: string }[] = [];
  page.on('response', async (respuesta) => {
    const url = new URL(respuesta.url());
    if (!url.pathname.startsWith('/api/')) return;
    try {
      cuerpos.push({ ruta: `${respuesta.request().method()} ${url.pathname}`, cuerpo: await respuesta.text() });
    } catch {
      // respuesta sin cuerpo (204) o navegación en curso
    }
  });
  return cuerpos;
}

test.describe('Calendario: privacidad y revocación de la agenda compartida (HU-184, G05-C11)', () => {
  let escenario: Escenario | undefined;
  let marcaActual = '';

  test.beforeEach(async ({ page }, testInfo) => {
    marcaActual = `E2E-C11-${Date.now()}-${testInfo.retry}`;
    await fijarRelojMananaTemprano(page);
    await login(page, CORREO_PROPIETARIO);
    await page.goto('/dashboard/calendario');
    // Punto de partida conocido aunque una corrida anterior se haya interrumpido.
    await limpiarEscenario(page, 'E2E-C11-');
    escenario = await prepararEscenario(page, marcaActual);
    await page.request.delete(`/api/usuarios/me/calendario/compartidos/${escenario.idMaria}`);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await limpiarEscenario(page, marcaActual, escenario?.idMaria);
  });

  test('quien recibe la agenda ve detalle solo de lo que ya podía ver, "Ocupado" de lo ajeno y nada de lo restringido, en pantalla y en la red', async ({ page, browser }) => {
    const e = escenario as Escenario;
    await compartirConMaria(page);

    const contexto = await browser.newContext();
    const maria = await contexto.newPage();
    try {
      await fijarRelojMananaTemprano(maria);
      const respuestas = registrarRespuestas(maria);
      await login(maria, CORREO_INVITADA);
      await maria.goto('/dashboard/calendario');
      await maria.getByRole('radio', { name: 'Día' }).click();

      // Compartir no pidió aceptación: Carlos aparece en la lista de María y le llegó el aviso.
      const casilla = maria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' });
      await expect(casilla).toBeVisible();
      const avisos = await maria.request.get('/api/notificaciones/mias/no-leidas');
      expect(avisos.status()).toBe(200);
      expect(await avisos.text()).toContain('CALENDARIO_COMPARTIDO');

      // Con el calendario de Carlos sin activar, María no ha pedido su agenda.
      expect(respuestas.some((r) => RUTA_AGENDA.test(r.ruta))).toBe(false);
      const espera = maria.waitForResponse((r) => RUTA_AGENDA.test(r.url()) && r.request().method() === 'GET');
      if (!(await casilla.isChecked())) await casilla.click();
      const agenda = await espera;
      expect(agenda.status()).toBe(200);
      const json = (await agenda.json()) as { eventos: Record<string, unknown>[]; tareas: Record<string, unknown>[] };

      // Contrato de red: lista cerrada de campos por visibilidad, y solo los dos eventos que le corresponden.
      const propios = json.eventos.filter((ev) => Object.values(e.ids).includes(ev.idEvento as number));
      expect(propios.map((ev) => ev.idEvento).sort()).toEqual([e.ids.comun, e.ids.ajeno].sort());
      const porId = Object.fromEntries(propios.map((ev) => [ev.idEvento as number, ev]));
      expect(Object.keys(porId[e.ids.comun]).sort()).toEqual(CLAVES_DETALLE);
      expect(porId[e.ids.comun]).toMatchObject({ visibilidad: 'DETALLE', tituloEvento: `${e.marca} comun`, tipoEvento: 'REVISION' });
      expect(Object.keys(porId[e.ids.ajeno]).sort()).toEqual(CLAVES_OCUPADO);
      expect(porId[e.ids.ajeno]).toMatchObject({ visibilidad: 'OCUPADO' });
      for (const ev of json.eventos) {
        expect(ev.visibilidad === 'OCUPADO' ? CLAVES_OCUPADO : CLAVES_DETALLE).toEqual(Object.keys(ev).sort());
        for (const privado of ['linkSesion', 'descripcionEvento', 'invitados', 'rolesDestino', 'ubicacionNombre', 'idCreador']) expect(ev).not.toHaveProperty(privado);
      }
      for (const tarea of json.tareas) expect(Object.keys(tarea).some((k) => /descripcion|asignad|correo/i.test(k))).toBe(false);

      // En pantalla: el ajeno solo como "Ocupado". El común ya está en el calendario de María (es integrante
      // de ese proyecto), así que la página no lo duplica como compartido: aparece una sola vez, como suyo.
      const ocupado = maria.getByRole('button', { name: /^Ocupado, 13:00 a 14:00, calendario de Carlos Mendoza/ });
      const comun = maria.getByRole('button', { name: new RegExp(`^${e.marca} comun, 09:00 a 10:00`) });
      await expect(ocupado).toBeVisible({ timeout: 15_000 });
      await expect(comun).toHaveCount(1);
      await expect(comun).not.toHaveAccessibleName(/calendario de Carlos Mendoza/);
      await expect(maria.getByText(`${e.marca} ajeno`)).toHaveCount(0);
      await expect(maria.getByText(`${e.marca} comunrestringido`)).toHaveCount(0);
      await expect(maria.getByRole('button', { name: /, 11:00 a 12:00/ })).toHaveCount(0);
      await expect(maria.getByRole('button', { name: /, 15:00 a 16:00/ })).toHaveCount(0);

      await ocupado.click();
      const dialogoOcupado = maria.getByRole('dialog', { name: 'Ocupado' });
      await expect(dialogoOcupado.getByText('Calendario de Carlos Mendoza · solo lectura')).toBeVisible();
      await expect(dialogoOcupado.getByRole('link')).toHaveCount(0);
      await expect(dialogoOcupado.getByRole('button', { name: /Editar|Eliminar/ })).toHaveCount(0);
      for (const privado of ['Link de la sesión', 'Descripción', PROYECTO_AJENO, 'Revisión']) await expect(dialogoOcupado.getByText(privado)).toHaveCount(0);
      await maria.keyboard.press('Escape');

      // El evento común lo abre como integrante (no lidera): ve su detalle y "Ver proyecto", sin editar ni eliminar.
      await comun.click();
      const dialogoComun = maria.getByRole('dialog', { name: `${e.marca} comun` });
      await expect(dialogoComun.getByText(PROYECTO_COMUN)).toBeVisible();
      await expect(dialogoComun.getByRole('link', { name: 'Ver proyecto' })).toBeVisible();
      await expect(dialogoComun.getByRole('button', { name: /Editar|Eliminar/ })).toHaveCount(0);
      await maria.keyboard.press('Escape');

      // G05-R01: ocultar el tipo "Otro" no esconde el bloque Ocupado; desactivar a Carlos sí.
      await maria.getByRole('button', { name: /Todos los eventos|Eventos filtrados/ }).click();
      await maria.getByRole('menuitemcheckbox', { name: 'Otro' }).click();
      await maria.keyboard.press('Escape');
      await expect(ocupado).toBeVisible();
      await maria.getByRole('button', { name: /Eventos filtrados/ }).click();
      await maria.getByRole('menuitem', { name: 'Mostrar todo' }).click();
      await casilla.click();
      await expect(ocupado).toHaveCount(0);
      // Ningún bloque de Carlos (su botón "Quitar el calendario de…" de la columna sí sigue ahí).
      await expect(maria.getByRole('button', { name: /, calendario de Carlos Mendoza/ })).toHaveCount(0);
      // Lo suyo no depende del calendario de Carlos.
      await expect(comun).toHaveCount(1);
      await casilla.click();
      await expect(ocupado).toBeVisible();

      // Semana y Mes: mismo contenido permitido, nada más.
      for (const vista of ['Semana', 'Mes']) {
        await maria.getByRole('radio', { name: vista }).click();
        await expect(maria.getByText('Ocupado').first()).toBeVisible();
        for (const secreto of e.secretos) await expect(maria.getByText(secreto)).toHaveCount(0);
      }

      // Ni el DOM ni NINGUNA respuesta de la API que recibió su navegador contienen lo ajeno o restringido.
      const dom = await maria.content();
      for (const secreto of e.secretos) {
        expect(dom, `DOM con "${secreto}"`).not.toContain(secreto);
        const fugas = respuestas.filter((r) => r.cuerpo.includes(secreto)).map((r) => r.ruta);
        expect(fugas, `respuestas con "${secreto}"`).toEqual([]);
      }
      // Sí conserva lo suyo: como integrante del proyecto común ve ese evento completo en su propio calendario.
      expect(respuestas.some((r) => r.ruta === 'GET /api/usuarios/me/eventos' && r.cuerpo.includes(`${e.marca} comun`))).toBe(true);
    } finally {
      await contexto.close();
    }

    // El calendario personal de Carlos no cambió por compartirlo: sus cuatro eventos, completos.
    const hoy = Date.now();
    const rango = `desde=${encodeURIComponent(new Date(hoy - 86_400_000).toISOString())}&hasta=${encodeURIComponent(new Date(hoy + 5 * 86_400_000).toISOString())}`;
    const mios = ((await (await page.request.get(`/api/usuarios/me/eventos?${rango}`)).json()) as Record<string, unknown>[]).filter((ev) => String(ev.tituloEvento).startsWith(e.marca));
    expect(mios).toHaveLength(4);
    for (const ev of mios) {
      expect(String(ev.linkSesion)).toContain('secreto-');
      expect(String(ev.descripcionEvento)).toContain('SECRETO-');
    }
  });

  // Compartir está limitado a 5 por minuto y usuario (G01, UI-16). Esta suite comparte tres veces por
  // corrida (una por prueba), así que cabe un reintento de CI sin tocar ese límite.
  test('un tercero no puede leer ni revocar la relación; cuando el propietario deja de compartir, quien recibía pierde el acceso: sin casilla, sin bloques, 403 y sin preferencia guardada', async ({ page, browser }) => {
    const e = escenario as Escenario;
    await compartirConMaria(page);
    const hoyMs = Date.now();
    const rangoSemana = `desde=${encodeURIComponent(new Date(hoyMs).toISOString())}&hasta=${encodeURIComponent(new Date(hoyMs + 7 * 86_400_000).toISOString())}`;

    // José (integrante del proyecto común, ajeno a esta relación) no puede leer la agenda de Carlos ni quitarla.
    const contextoJose = await browser.newContext();
    try {
      const jose = await contextoJose.newPage();
      await login(jose, 'jose.ramirez@uvg.edu.gt');
      const lectura = await jose.request.get(`/api/usuarios/me/calendario/compartidos-conmigo/${e.idCarlos}/agenda?${rangoSemana}`);
      expect(lectura.status()).toBe(403);
      const cuerpoJose = await lectura.text();
      for (const secreto of e.secretos) expect(cuerpoJose).not.toContain(secreto);
      // Sus bajas solo actúan sobre relaciones propias, que no existen.
      expect(await (await jose.request.delete(`/api/usuarios/me/calendario/compartidos-conmigo/${e.idCarlos}`)).json()).toEqual({ eliminado: false });
      expect(await (await jose.request.delete(`/api/usuarios/me/calendario/compartidos/${e.idMaria}`)).json()).toEqual({ eliminado: false });
    } finally {
      await contextoJose.close();
    }
    const lista = (await (await page.request.get('/api/usuarios/me/calendario/compartidos')).json()) as { compartidoPorMi: { idUsuario: number }[] };
    expect(lista.compartidoPorMi.some((p) => p.idUsuario === e.idMaria)).toBe(true);
    // Sin sesión, la API responde 401.
    const anonimo = await browser.newContext();
    try {
      expect((await anonimo.request.get(`${new URL(page.url()).origin}/api/usuarios/me/calendario/compartidos`)).status()).toBe(401);
      expect((await anonimo.request.get(`${new URL(page.url()).origin}/api/usuarios/me/calendario/compartidos-conmigo/${e.idCarlos}/agenda?${rangoSemana}`)).status()).toBe(401);
    } finally {
      await anonimo.close();
    }

    const contexto = await browser.newContext();
    const maria = await contexto.newPage();
    try {
      await fijarRelojMananaTemprano(maria);
      await login(maria, CORREO_INVITADA);
      await maria.goto('/dashboard/calendario');
      await maria.getByRole('radio', { name: 'Día' }).click();
      const casilla = maria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' });
      if (!(await casilla.isChecked())) await casilla.click();
      const ocupado = maria.getByRole('button', { name: /^Ocupado, 13:00 a 14:00, calendario de Carlos Mendoza/ });
      await expect(ocupado).toBeVisible({ timeout: 15_000 });
      const claveActivos = `calendario:compartidos-activos:${e.idMaria}`;
      expect(JSON.parse((await maria.evaluate((k) => localStorage.getItem(k), claveActivos)) ?? '[]')).toContain(e.idCarlos);

      // Carlos revoca desde su diálogo.
      const compartir = await abrirCompartir(page);
      await compartir.getByRole('button', { name: 'Dejar de compartir con María López' }).click();
      await expect(compartir.getByRole('button', { name: 'Dejar de compartir con María López' })).toHaveCount(0);
      await page.keyboard.press('Escape');

      // La API le niega la agenda a María de inmediato, aunque su pestaña siga abierta.
      const hoy = Date.now();
      const rango = `desde=${encodeURIComponent(new Date(hoy).toISOString())}&hasta=${encodeURIComponent(new Date(hoy + 7 * 86_400_000).toISOString())}`;
      const denegada = await maria.request.get(`/api/usuarios/me/calendario/compartidos-conmigo/${e.idCarlos}/agenda?${rango}`);
      expect(denegada.status()).toBe(403);
      const cuerpo = await denegada.text();
      for (const secreto of [...e.secretos, `${e.marca} comun`]) expect(cuerpo).not.toContain(secreto);

      // Al recargar desaparece todo rastro del calendario de Carlos.
      await maria.reload();
      await maria.getByRole('radio', { name: 'Día' }).click();
      await expect(maria.getByTestId('cuadricula-horas')).toBeVisible();
      await expect(maria.getByRole('checkbox', { name: 'Ver el calendario de Carlos Mendoza' })).toHaveCount(0);
      await expect(maria.getByRole('button', { name: /calendario de Carlos Mendoza/ })).toHaveCount(0);
      await expect(maria.getByText('Ocupado')).toHaveCount(0);
      await expect.poll(async () => JSON.parse((await maria.evaluate((k) => localStorage.getItem(k), claveActivos)) ?? '[]')).not.toContain(e.idCarlos);
      // Lo suyo sigue: el evento del proyecto común continúa en su calendario personal.
      await expect(maria.getByRole('button', { name: new RegExp(`^${e.marca} comun, 09:00 a 10:00`) })).toBeVisible();
    } finally {
      await contexto.close();
    }

    // Y Carlos conserva su calendario completo.
    await page.reload();
    await page.getByRole('radio', { name: 'Día' }).click();
    for (const hora of ['09:00 a 10:00', '11:00 a 12:00', '13:00 a 14:00', '15:00 a 16:00']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${e.marca} \\w+, ${hora}`) })).toBeVisible({ timeout: 15_000 });
    }
  });
});
