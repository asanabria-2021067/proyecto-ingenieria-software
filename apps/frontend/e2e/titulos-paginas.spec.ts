import type { Browser, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * FIX-38: cada pantalla principal del dashboard muestra exactamente UN título
 * de página (`PageTitle`, `data-slot="page-title"`): ni ninguno ni dos.
 *
 * Cuentas sembradas: estudiante (carlos.mendoza, líder del Proyecto 1) y
 * administrador. No hay cuenta de coordinador sembrada; su panel es el mismo
 * componente que el del administrador (`/dashboard/coordinador` re-exporta
 * `/dashboard/admin`), así que lo cubre el recorrido del administrador.
 *
 * Solo lectura: no crea ni modifica datos.
 */

const ESTUDIANTE = 'carlos.mendoza@uvg.edu.gt';
const ADMIN = 'admin@uvg.edu.gt';

const RUTAS_ESTUDIANTE = [
  '/dashboard',
  '/dashboard/proyectos',
  '/dashboard/projects/mine',
  '/dashboard/mis-tareas',
  '/dashboard/mis-horas',
  '/dashboard/mis-postulaciones',
  '/dashboard/calendario',
  '/dashboard/perfil',
  '/dashboard/perfil/editar',
  '/dashboard/configuracion',
  '/dashboard/ayuda',
  '/dashboard/notificaciones',
  '/dashboard/mensajes',
  '/dashboard/organizaciones',
  '/dashboard/personas',
  // Proyecto 1: carlos.mendoza es su líder, así que ve también las vistas de liderazgo.
  '/dashboard/proyectos/1',
  '/dashboard/projects/1/kanban',
  '/dashboard/proyectos/1/miembros',
  '/dashboard/proyectos/1/sprints',
];

const RUTAS_ADMIN = [
  '/dashboard/admin',
  '/dashboard/admin/usuarios',
  '/dashboard/admin/proyectos?grupo=activos',
  '/dashboard/admin/bandeja',
  '/dashboard/admin/horas',
  '/dashboard/admin/metricas',
  '/dashboard/admin/seguridad',
  '/dashboard/admin/tablas',
  '/dashboard/admin/apelaciones',
  '/dashboard/projects/admin/reviews',
  '/dashboard/configuracion',
];

async function sesion(browser: Browser, correo: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await desactivarTour(page);
  await login(page, correo, correo === ADMIN ? '/dashboard/admin' : undefined);
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}

const grupos = [
  { rol: 'estudiante', correo: ESTUDIANTE, rutas: RUTAS_ESTUDIANTE },
  { rol: 'administrador', correo: ADMIN, rutas: RUTAS_ADMIN },
];

for (const { rol, correo, rutas } of grupos) {
  test(`FIX-38: ${rol}: cada pantalla tiene exactamente un título de página`, async ({ browser }) => {
    const page = await sesion(browser, correo);
    try {
      for (const ruta of rutas) {
        await page.goto(ruta);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-slot="page-title"]'), `títulos de página en ${ruta}`).toHaveCount(1);
      }
    } finally {
      await page.context().close();
    }
  });
}
