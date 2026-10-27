import type { Page, Route } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * HU-204 (T-392): el skeleton aparece mientras la petición principal de cada
 * vista sigue pendiente y deja paso al contenido, al estado vacío o al error.
 *
 * La petición se RETIENE con `page.route` (nunca con esperas fijas) y se suelta
 * contra el backend real; el contenido esperado se lee antes por la API, así
 * que no depende de cuántos datos tenga la siembra. Vacío y error se inducen
 * respondiendo en lugar del backend. Solo lectura: no escribe nada.
 */

// El primer inicio de sesión de la corrida va por UI (luego se reutiliza la cookie).
test.describe.configure({ timeout: 60_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';
const API = `${API_URL}/api`;
/** Proyecto publicado de otra cuenta: Carlos lo ve como detalle público. */
const PROYECTO_AJENO = 2;
/** Un 500 se reintenta tres veces con espera creciente antes de mostrar el error. */
const TRAS_REINTENTOS = { timeout: 20_000 };

interface Retencion {
  /** Se resuelve cuando la vista ya pidió el recurso. */
  pedida: Promise<void>;
  soltar: () => void;
}

/** Retiene toda petición que coincida hasta `soltar()`; después pasan al backend. */
async function retener(page: Page, patron: RegExp): Promise<Retencion> {
  let soltar!: () => void;
  let marcarPedida!: () => void;
  const liberada = new Promise<void>((r) => (soltar = r));
  const pedida = new Promise<void>((r) => (marcarPedida = r));
  await page.route(patron, async (route: Route) => {
    marcarPedida();
    await liberada;
    await route.continue().catch(() => undefined);
  });
  return { pedida, soltar };
}

async function responder(page: Page, patron: RegExp, status: number, body: unknown): Promise<void> {
  await page.route(patron, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function leerApi<T>(page: Page, ruta: string): Promise<T> {
  const respuesta = await page.request.get(`${API}${ruta}`);
  expect(respuesta.status(), `GET ${ruta}`).toBe(200);
  return (await respuesta.json()) as T;
}

/** Una sola región anuncia la carga, ocupada, y sus bloques no se leen. */
async function esperarSkeleton(page: Page, nombre: string): Promise<void> {
  const region = page.getByRole('status', { name: nombre });
  await expect(region).toHaveCount(1);
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute('aria-busy', 'true');
  const bloques = region.locator('[data-slot="skeleton"]');
  expect(await bloques.count()).toBeGreaterThan(0);
  expect(await bloques.evaluateAll((els) => els.every((el) => el.getAttribute('aria-hidden') === 'true'))).toBe(true);
}

async function sinSkeleton(page: Page, nombre: string, opciones = {}): Promise<void> {
  await expect(page.getByRole('status', { name: nombre }), `«${nombre}» no debe quedar visible`).toHaveCount(0, opciones);
}

async function entrar(page: Page, correo: string): Promise<void> {
  await desactivarTour(page);
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
}

test.describe('HU-204: estados de carga del estudiante', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CARLOS);
  });

  test('shell: la sesión se resuelve tras un skeleton del layout, no un spinner', async ({ page }) => {
    const me = await retener(page, /\/api\/usuarios\/me(\?|$)/);
    await page.goto('/dashboard/mis-postulaciones');
    await me.pedida;
    await esperarSkeleton(page, 'Cargando UVGenius');

    me.soltar();
    await sinSkeleton(page, 'Cargando UVGenius');
    await expect(page.getByRole('heading', { level: 1, name: 'Mis Postulaciones' })).toBeVisible();
  });

  test('inicio: tarjetas en skeleton hasta que llegan los destacados', async ({ page }) => {
    const destacados = await retener(page, /\/api\/proyectos\/destacados/);
    await page.goto('/dashboard');
    await destacados.pedida;
    await esperarSkeleton(page, 'Cargando tu inicio');

    destacados.soltar();
    await sinSkeleton(page, 'Cargando tu inicio');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('inicio: un fallo no deja el skeleton puesto', async ({ page }) => {
    await responder(page, /\/api\/proyectos\/destacados/, 500, { message: 'fallo inducido' });
    await page.goto('/dashboard');
    // Primero el desenlace (tras los reintentos); solo entonces tiene sentido «ya no hay skeleton».
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(TRAS_REINTENTOS);
    await sinSkeleton(page, 'Cargando tu inicio');
  });

  test.describe('proyectos disponibles', () => {
    test('skeleton de tarjetas → proyectos reales', async ({ page }) => {
      const proyectos = await leerApi<unknown[]>(page, '/proyectos');
      const lista = await retener(page, /\/api\/proyectos(\?|$)/);
      await page.goto('/dashboard/proyectos');
      await lista.pedida;
      await esperarSkeleton(page, 'Cargando proyectos');
      await expect(page.getByRole('link', { name: 'Ver proyecto' })).toHaveCount(0);

      lista.soltar();
      await sinSkeleton(page, 'Cargando proyectos');
      if (proyectos.length > 0) {
        await expect(page.getByRole('link', { name: 'Ver proyecto' }).first()).toBeVisible();
      } else {
        await expect(page.getByText('Todavía no hay proyectos disponibles.')).toBeVisible();
      }
    });

    test('vacío: muestra el estado vacío y no el skeleton', async ({ page }) => {
      await responder(page, /\/api\/proyectos(\?|$)/, 200, []);
      await page.goto('/dashboard/proyectos');
      await expect(page.getByText('Todavía no hay proyectos disponibles.')).toBeVisible();
      await sinSkeleton(page, 'Cargando proyectos');
    });

    test('error: muestra el error y no el skeleton', async ({ page }) => {
      await responder(page, /\/api\/proyectos(\?|$)/, 500, { message: 'fallo inducido' });
      await page.goto('/dashboard/proyectos');
      await expect(page.getByRole('alert').filter({ hasText: 'No fue posible cargar los proyectos.' })).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando proyectos');
    });

    test('filtrar por organización vuelve a mostrar el skeleton mientras carga el filtro', async ({ page }) => {
      const [organizacion] = await leerApi<{ idOrganizacion: number; nombreOrganizacion: string }[]>(page, '/organizaciones');
      test.skip(!organizacion, 'La siembra no tiene organizaciones.');

      await page.goto('/dashboard/proyectos');
      await sinSkeleton(page, 'Cargando proyectos');
      const filtrada = await retener(page, new RegExp(`/api/proyectos\\?organizacionId=${organizacion.idOrganizacion}`));

      await page.getByRole('combobox', { name: 'Filtrar proyectos por organizacion' }).click();
      await page.getByRole('option', { name: organizacion.nombreOrganizacion }).click();
      await filtrada.pedida;
      await esperarSkeleton(page, 'Cargando proyectos');

      filtrada.soltar();
      await sinSkeleton(page, 'Cargando proyectos');
      await expect(page.getByRole('link', { name: 'Ver proyecto' }).or(page.getByText('Sin resultados'))).not.toHaveCount(0);
    });
  });

  test.describe('mis postulaciones', () => {
    test('skeleton de lista → postulaciones reales', async ({ page }) => {
      const reales = await leerApi<{ rolProyecto: { nombreRol: string } }[]>(page, '/postulaciones/mis-postulaciones');
      const lista = await retener(page, /\/api\/postulaciones\/mis-postulaciones/);
      await page.goto('/dashboard/mis-postulaciones');
      await lista.pedida;
      await esperarSkeleton(page, 'Cargando tus postulaciones');

      lista.soltar();
      await sinSkeleton(page, 'Cargando tus postulaciones');
      if (reales.length > 0) {
        await expect(page.getByRole('heading', { level: 2, name: reales[0].rolProyecto.nombreRol }).first()).toBeVisible();
      } else {
        await expect(page.getByText('Encuentra tu siguiente colaboracion')).toBeVisible();
      }
    });

    test('vacío y error se distinguen de la carga', async ({ page }) => {
      await responder(page, /\/api\/postulaciones\/mis-postulaciones/, 200, []);
      await page.goto('/dashboard/mis-postulaciones');
      await expect(page.getByText('Encuentra tu siguiente colaboracion')).toBeVisible();
      await sinSkeleton(page, 'Cargando tus postulaciones');

      await page.unrouteAll();
      await responder(page, /\/api\/postulaciones\/mis-postulaciones/, 500, { message: 'fallo inducido' });
      await page.goto('/dashboard/mis-postulaciones');
      await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar tus postulaciones' })).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando tus postulaciones');
    });
  });

  test.describe('notificaciones', () => {
    test('skeleton de lista → bandeja real', async ({ page }) => {
      const pagina = await leerApi<{ data: { tituloNotificacion: string }[] }>(page, '/notificaciones?page=1&limit=20');
      const lista = await retener(page, /\/api\/notificaciones\?page=/);
      await page.goto('/dashboard/notificaciones');
      await lista.pedida;
      await esperarSkeleton(page, 'Cargando notificaciones');

      lista.soltar();
      await sinSkeleton(page, 'Cargando notificaciones');
      if (pagina.data.length > 0) {
        await expect(page.getByText(pagina.data[0].tituloNotificacion).first()).toBeVisible();
      } else {
        await expect(page.getByText('Todo está al día')).toBeVisible();
      }
    });

    test('vacío y error se distinguen de la carga', async ({ page }) => {
      await responder(page, /\/api\/notificaciones\?page=/, 200, { data: [], total: 0, page: 1, totalPages: 0 });
      await page.goto('/dashboard/notificaciones');
      // El estado vacío es el de la lista de la bandeja, no otro texto de la página.
      const bandeja = page.getByRole('region', { name: 'Bandeja de entrada' });
      await expect(bandeja.getByText('Todo está al día')).toBeVisible();
      await sinSkeleton(page, 'Cargando notificaciones');

      await page.unrouteAll();
      await responder(page, /\/api\/notificaciones\?page=/, 500, { message: 'fallo inducido' });
      await page.goto('/dashboard/notificaciones');
      await expect(page.getByText('No se pudieron cargar las notificaciones')).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando notificaciones');
    });
  });

  test.describe('mis tareas', () => {
    test('skeleton de filas → tareas reales', async ({ page }) => {
      const reales = await leerApi<unknown[]>(page, '/usuarios/me/tareas');
      const lista = await retener(page, /\/api\/usuarios\/me\/tareas/);
      await page.goto('/dashboard/mis-tareas');
      await lista.pedida;
      await esperarSkeleton(page, 'Cargando tus tareas');

      lista.soltar();
      await sinSkeleton(page, 'Cargando tus tareas');
      if (reales.length > 0) {
        await expect(page.getByRole('region', { name: 'Resumen de tareas' })).toBeVisible();
      } else {
        await expect(page.getByText('No tienes tareas asignadas')).toBeVisible();
      }
    });

    test('vacío y error se distinguen de la carga', async ({ page }) => {
      await responder(page, /\/api\/usuarios\/me\/tareas/, 200, []);
      await page.goto('/dashboard/mis-tareas');
      await expect(page.getByText('No tienes tareas asignadas')).toBeVisible();
      await sinSkeleton(page, 'Cargando tus tareas');

      await page.unrouteAll();
      await responder(page, /\/api\/usuarios\/me\/tareas/, 500, { message: 'fallo inducido' });
      await page.goto('/dashboard/mis-tareas');
      await expect(page.getByText('No se pudieron cargar tus tareas')).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando tus tareas');
    });
  });

  test.describe('detalle público de proyecto', () => {
    const ruta = new RegExp(`/api/proyectos/${PROYECTO_AJENO}(\\?|$)`);

    test('skeleton de detalle → título del proyecto', async ({ page }) => {
      const proyecto = await leerApi<{ tituloProyecto: string }>(page, `/proyectos/${PROYECTO_AJENO}`);
      const detalle = await retener(page, ruta);
      await page.goto(`/dashboard/proyectos/${PROYECTO_AJENO}`);
      await detalle.pedida;
      await esperarSkeleton(page, 'Cargando proyecto');

      detalle.soltar();
      await sinSkeleton(page, 'Cargando proyecto');
      await expect(page.getByRole('heading', { name: proyecto.tituloProyecto }).first()).toBeVisible();
    });

    test('error: muestra el error y no el skeleton', async ({ page }) => {
      await responder(page, ruta, 500, { message: 'fallo inducido' });
      await page.goto(`/dashboard/proyectos/${PROYECTO_AJENO}`);
      await expect(page.getByRole('alert').filter({ hasText: 'No fue posible cargar la información del proyecto.' })).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando proyecto');
    });
  });

  test.describe('perfil', () => {
    const estadisticas = /\/api\/usuarios\/me\/dashboard/;

    test('las horas se muestran en skeleton hasta que llegan, nunca como «0 / N/A»', async ({ page }) => {
      const horas = await retener(page, estadisticas);
      await page.goto('/dashboard/perfil');
      await horas.pedida;
      await esperarSkeleton(page, 'Cargando tus horas');
      await expect(page.getByText('Horas beca')).toHaveCount(0);

      horas.soltar();
      await sinSkeleton(page, 'Cargando tus horas');
      await expect(page.getByText('Horas beca')).toBeVisible();
    });

    test('si las horas fallan, el skeleton no se queda', async ({ page }) => {
      await responder(page, estadisticas, 500, { message: 'fallo inducido' });
      await page.goto('/dashboard/perfil');
      await expect(page.getByText('Horas beca')).toBeVisible(TRAS_REINTENTOS);
      await sinSkeleton(page, 'Cargando tus horas');
    });
  });
});

test.describe('HU-204: estados de carga de administración', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, ADMIN);
  });

  const usuarios = /\/api\/admin\/usuarios(\?|$)/;

  test('usuarios: skeleton de tabla → usuarios reales', async ({ page }) => {
    const lista = await retener(page, usuarios);
    await page.goto('/dashboard/admin/usuarios');
    await lista.pedida;
    await esperarSkeleton(page, 'Cargando usuarios');

    lista.soltar();
    await sinSkeleton(page, 'Cargando usuarios');
    // La tabla está paginada: basta con que pinte filas reales bajo su encabezado.
    const tabla = page.getByRole('table');
    await expect(tabla.getByRole('columnheader', { name: 'Correo institucional' })).toBeVisible();
    await expect(tabla.getByRole('row').nth(1)).toBeVisible();
  });

  test('usuarios: vacío y error se distinguen de la carga', async ({ page }) => {
    await responder(page, usuarios, 200, { data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    await page.goto('/dashboard/admin/usuarios');
    await expect(page.getByText('No hay usuarios registrados.')).toBeVisible();
    await sinSkeleton(page, 'Cargando usuarios');

    await page.unrouteAll();
    await responder(page, usuarios, 500, { message: 'fallo inducido' });
    await page.goto('/dashboard/admin/usuarios');
    await expect(page.getByText('No se pudieron cargar los usuarios.')).toBeVisible(TRAS_REINTENTOS);
    await sinSkeleton(page, 'Cargando usuarios');
  });
});
