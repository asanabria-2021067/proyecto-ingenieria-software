import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * T-322 (HU-183): recorrido completo del administrador por su menú, en un
 * navegador real contra la pila aislada.
 *
 * El administrador sembrado inicia sesión por la interfaz y abre, con clics en
 * «Navegación administrativa», cada destino del menú (`adminNavEntries`). En
 * cada uno se exige: la ruta esperada, su titular, el contenido principal
 * que solo se pinta con los datos cargados (con datos o en su estado vacío),
 * que su API respondió 200, que no queda nada cargando y que no hay ningún
 * estado de error visible. Durante todo el recorrido se vigilan los errores
 * de JavaScript y las respuestas 5xx/401/403 de la API: cada fallo se
 * atribuye al destino en que ocurrió.
 *
 * Secciones de HU-183 → destinos reales: Usuarios (Gestión de Usuarios),
 * Proyectos (Activos, Cerrados, Calendario de Sprints), Solicitudes
 * (Recuperación de contraseña, Solicitudes de publicación, Solicitudes de
 * cierre), Métricas (Tendencias de uso), Verificación de cuentas (Cuentas
 * pendientes) y Seguridad (Eventos de seguridad). Se recorren también
 * Apelaciones, Etiquetas y el Panel Admin: el criterio es todo el menú.
 *
 * Solo lectura: no crea ni modifica datos, y no depende de cuántos registros
 * haya en cada bandeja.
 */

const ADMIN = 'admin@uvg.edu.gt';
const API = `${API_URL}/api`;

interface Destino {
  /** Grupo del menú que lo contiene; `null` si va suelto. */
  grupo: string | null;
  etiqueta: string;
  ruta: string;
  titular: RegExp;
  /** Ruta de la API (bajo /api) que la vista necesita para cargar. */
  api: RegExp | null;
  /** Algo que la vista solo pinta cuando sus datos llegaron bien. */
  contenido: (main: Locator) => Locator;
}

const estado = (main: Locator, texto: string | RegExp) => main.getByRole('status').filter({ hasText: texto });

/**
 * Orden del menú. El login ya aterriza en el Panel Admin, así que su enlace
 * se pulsa al final, de vuelta desde otra vista.
 */
const DESTINOS: Destino[] = [
  {
    grupo: 'Usuarios',
    etiqueta: 'Gestión de Usuarios',
    ruta: '/dashboard/admin/usuarios',
    titular: /Gestión de Usuarios/,
    api: /^\/api\/admin\/usuarios(\?|$)/,
    contenido: (main) => estado(main, /^Total de usuarios:/),
  },
  {
    grupo: 'Usuarios',
    etiqueta: 'Recuperación de contraseña',
    ruta: '/dashboard/admin/solicitudes-recuperacion',
    titular: /Recuperación de contraseña/,
    api: /^\/api\/admin\/password-reset-requests(\?|$)/,
    contenido: (main) => estado(main, /^Total de solicitudes pendientes:/),
  },
  {
    grupo: 'Proyectos',
    etiqueta: 'Activos',
    ruta: '/dashboard/admin/proyectos?grupo=activos',
    titular: /^Activos$/,
    api: /^\/api\/admin\/proyectos\?(.*&)?grupo=activos(&|$)/,
    contenido: (main) => estado(main, /^Total de proyectos activos:/),
  },
  {
    grupo: 'Proyectos',
    etiqueta: 'Solicitudes de publicación',
    ruta: '/dashboard/projects/admin/reviews',
    titular: /Solicitudes de publicación/,
    api: /^\/api\/revisiones\/admin\/bandeja(\?|$)/,
    contenido: (main) => main.getByRole('group', { name: 'Pendientes de revisión' }),
  },
  {
    grupo: 'Proyectos',
    etiqueta: 'Solicitudes de cierre',
    ruta: '/dashboard/admin/proyectos?grupo=cierres',
    titular: /Solicitudes de cierre/,
    api: /^\/api\/admin\/proyectos\?(.*&)?grupo=cierres(&|$)/,
    contenido: (main) =>
      main.getByRole('group', { name: 'Pendientes de evaluación' }).or(estado(main, 'No hay solicitudes de cierre pendientes.')),
  },
  {
    grupo: 'Proyectos',
    etiqueta: 'Cerrados',
    ruta: '/dashboard/admin/proyectos?grupo=cerrados',
    titular: /^Cerrados$/,
    api: /^\/api\/admin\/proyectos\?(.*&)?grupo=cerrados(&|$)/,
    contenido: (main) => estado(main, /^Total de proyectos cerrados:/),
  },
  {
    grupo: 'Proyectos',
    etiqueta: 'Calendario de Sprints',
    ruta: '/dashboard/admin/sprints',
    titular: /Calendario de Sprints/,
    api: /^\/api\/admin\/sprints\/calendario(\?|$)/,
    contenido: (main) =>
      estado(main, /Sprints? operables?$/).or(estado(main, 'No hay Sprints operables para supervisar.')),
  },
  {
    grupo: 'Gobernanza',
    etiqueta: 'Apelaciones',
    ruta: '/dashboard/admin/apelaciones',
    titular: /Apelaciones de liderazgo/,
    api: /^\/api\/admin\/liderazgo\/apelaciones\?/,
    contenido: (main) => estado(main, /\d+ apelaci(ón|ones)/),
  },
  {
    grupo: 'Métricas',
    etiqueta: 'Tendencias de uso',
    ruta: '/dashboard/admin/metricas',
    titular: /Tendencias de uso/,
    api: /^\/api\/admin\/metricas\?/,
    // Con datos, cada gráfica lleva su descripción; sin actividad, el estado vacío.
    contenido: (main) =>
      main.getByText('Cuentas creadas', { exact: true }).or(estado(main, 'Aún no hay actividad para mostrar tendencias.')),
  },
  {
    grupo: 'Verificación y seguridad',
    etiqueta: 'Cuentas pendientes',
    ruta: '/dashboard/admin/cuentas-pendientes',
    titular: /Cuentas pendientes/,
    api: /^\/api\/admin\/cuentas-pendientes(\?|$)/,
    contenido: (main) =>
      main
        .getByRole('button', { name: /^Aprobar la cuenta de / })
        .first()
        .or(main.getByText('No hay cuentas pendientes de verificación', { exact: true })),
  },
  {
    grupo: 'Verificación y seguridad',
    etiqueta: 'Eventos de seguridad',
    ruta: '/dashboard/admin/seguridad',
    titular: /Eventos de seguridad/,
    api: /^\/api\/admin\/eventos-seguridad(\?|$)/,
    contenido: (main) =>
      main.getByRole('table', { name: /Eventos de seguridad/ }).or(estado(main, 'Todavía no hay eventos de seguridad registrados.')),
  },
  {
    grupo: 'Diagnóstico',
    etiqueta: 'Etiquetas (temporal)',
    ruta: '/dashboard/admin/etiquetas',
    titular: /^Etiquetas$/,
    // Catálogo estático: no consulta la API.
    api: null,
    contenido: (main) => main.getByRole('region', { name: 'Sistema: tonos y tamaños' }),
  },
  {
    grupo: null,
    etiqueta: 'Panel Admin',
    ruta: '/dashboard/admin',
    titular: /Panel de Administración/,
    api: /^\/api\/admin\/estadisticas(\?|$)/,
    contenido: (main) => main.getByRole('group', { name: 'Proyectos Activos' }),
  },
];

interface Respuesta {
  ruta: string;
  status: number;
}

/**
 * Registra las respuestas de la API y los fallos que no deben ocurrir en una
 * sesión administrativa válida, atribuidos al destino en curso. Un 404 o un
 * 4xx de validación puede ser legítimo y no se cuenta aquí: si la vista lo
 * necesitaba, falla su propia comprobación de API o de contenido.
 */
function vigilar(page: Page) {
  const registro = { destino: 'inicio de sesión', respuestas: [] as Respuesta[], fallos: [] as string[] };
  page.on('pageerror', (error) => registro.fallos.push(`[${registro.destino}] error de JavaScript: ${error.message.slice(0, 200)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /hydrat|did not match|Minified React error/i.test(msg.text())) {
      registro.fallos.push(`[${registro.destino}] ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('response', (response) => {
    if (!response.url().startsWith(`${API}/`)) return;
    const url = new URL(response.url());
    const status = response.status();
    registro.respuestas.push({ ruta: `${url.pathname}${url.search}`, status });
    if (status >= 500 || status === 401 || status === 403) {
      registro.fallos.push(`[${registro.destino}] ${status} ${response.request().method()} ${url.pathname}`);
    }
  });
  return registro;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

/** Abre el grupo si está plegado y devuelve el enlace del destino. */
async function enlaceDe(page: Page, { grupo, etiqueta }: Destino) {
  const enlace = nav(page).getByRole('link', { name: etiqueta, exact: true });
  if (grupo && !(await enlace.isVisible())) {
    await nav(page).getByRole('button', { name: new RegExp(`^${grupo}`) }).click();
  }
  await expect(enlace, etiqueta).toBeVisible();
  return enlace;
}

/** La vista terminó de cargar sin errores: nada pendiente, ninguna alerta ni aviso de fallo. */
async function sinCargaNiErrores(main: Locator, etiqueta: string) {
  await expect(main.locator('[aria-label^="Cargando"]'), `${etiqueta}: sigue cargando`).toHaveCount(0);
  await expect(main.locator('[aria-busy="true"]'), `${etiqueta}: sigue cargando`).toHaveCount(0);
  await expect(main.getByRole('alert'), `${etiqueta}: muestra un error`).toHaveCount(0);
  await expect(main.getByText(/No se pud(o|ieron) (cargar|conectar)/), `${etiqueta}: muestra un error`).toHaveCount(0);
}

test.describe('T-322: navegación de administración', () => {
  test('el administrador recorre cada sección del menú y todas cargan sin errores', async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await (await browser.newContext()).newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await desactivarTour(page);
    const registro = vigilar(page);

    // Inicio de sesión real: el login lleva a administración a su panel (`login` espera esa ruta exacta).
    await login(page, ADMIN, '/dashboard/admin');
    const yo = await page.request.get(`${API}/usuarios/me`);
    expect(yo.status(), 'sesión del administrador').toBe(200);
    expect((await yo.json()).roles, 'rol de la sesión').toContain('administrador');
    // `AdminLayout` solo pinta el menú cuando el usuario tiene permiso de administración.
    await expect(nav(page)).toBeVisible();
    expect(registro.fallos, 'fallos al iniciar sesión').toEqual([]);

    const main = page.getByRole('main');
    for (const destino of DESTINOS) {
      const { etiqueta, ruta, titular, api, contenido } = destino;
      registro.destino = etiqueta;

      const enlace = await enlaceDe(page, destino);
      await expect(enlace, etiqueta).toHaveAttribute('href', ruta);
      await enlace.click();

      // La ruta exacta: ni login, ni /dashboard (sin permiso), ni otra vista.
      await expect(page, etiqueta).toHaveURL(new RegExp(`${ruta.replace(/[?#]/g, '\\$&')}$`));
      await expect(main.getByRole('heading', { level: 1 }), etiqueta).toHaveText(titular);
      await expect(contenido(main).first(), `${etiqueta}: contenido principal`).toBeVisible();
      await sinCargaNiErrores(main, etiqueta);

      // Su API respondió bien. React Query reutiliza durante un minuto lo ya pedido,
      // así que vale la respuesta de esta visita o de una anterior en el recorrido.
      if (api) {
        const propias = registro.respuestas.filter((r) => api.test(r.ruta));
        expect(propias.map((r) => r.status), `${etiqueta}: respuestas de su API`).toContain(200);
        expect(propias.filter((r) => r.status >= 400), `${etiqueta}: respuestas fallidas de su API`).toEqual([]);
      }
      expect(registro.fallos, `${etiqueta}: fallos durante la carga`).toEqual([]);
    }

    await page.context().close();
  });
});
