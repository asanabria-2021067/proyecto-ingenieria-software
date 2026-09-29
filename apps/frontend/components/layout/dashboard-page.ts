import { cn } from '@/lib/utils';

/**
 * Contenedor horizontal único de las vistas principales del dashboard.
 *
 * Es la regla de «Proyectos Disponibles» (/dashboard/proyectos), que es la
 * referencia: ancho máximo de 1400 px centrado y 32 px de gutter a cada
 * lado. Así, al cambiar de vista, el contenido empieza siempre en la misma
 * guía después de la sidebar. Solo fija lo horizontal: el espaciado
 * vertical lo decide cada página con `extra`.
 */
export const DASHBOARD_PAGE_CLASS = 'mx-auto w-full max-w-[1400px] px-section';

export function dashboardPage(extra?: string): string {
  return cn(DASHBOARD_PAGE_CLASS, extra);
}
