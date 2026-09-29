/**
 * HU-158 (T-232): query key de «Mis Horas». Es un read-model propio
 * (GET /usuarios/me/horas), distinto de `['dashboard-stats']` y de las horas
 * de una tarea: no se reutilizan ni se invalidan entre sí.
 */
export const misHorasQueryKey = ['mis-horas'] as const;
