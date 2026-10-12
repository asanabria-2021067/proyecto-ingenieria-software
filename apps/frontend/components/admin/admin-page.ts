/**
 * Primitivas de página de las vistas administrativas (T-320, HU-163).
 *
 * Son clases, no componentes, igual que `components/dashboard/data-table.tsx`:
 * cada vista decide su estructura, pero el ancho, el relleno, el titular y el
 * párrafo de entrada salen de aquí en vez de repetirse como literales.
 */

/** Ancho máximo y márgenes laterales de toda vista administrativa. */
export const ADMIN_PAGE_WIDTH = 'mx-auto w-full max-w-[1400px] px-4 md:px-8';
/** Página administrativa estándar: ancho más el relleno vertical habitual. */
export const ADMIN_PAGE = `${ADMIN_PAGE_WIDTH} pb-12 pt-8`;
/** Vista de lectura (una apelación): columna más estrecha, mismos márgenes. */
export const ADMIN_PAGE_NARROW = 'mx-auto w-full max-w-[1100px] px-4 md:px-8';
/** Titular único de la página. */
export const ADMIN_PAGE_TITLE = 'type-display text-balance';
/** Párrafo de entrada bajo el titular. */
export const ADMIN_PAGE_LEAD = 'mt-tight max-w-2xl text-base text-tertiary';

/**
 * T-321 — ancla de «Tendencias de uso» (HU-178) dentro del Panel Admin. Las métricas no tienen ruta
 * propia: el menú lateral enlaza a esta ancla en vez de duplicar la sección en otra página.
 */
export const ADMIN_METRICS_ANCHOR = 'metricas';
export const ADMIN_METRICS_HREF = `/dashboard/admin#${ADMIN_METRICS_ANCHOR}`;
