/** Respuestas que no cambian por repetir la petición. */
const ESTADOS_TERMINALES = new Set([401, 403, 404]);

/**
 * Política `retry` de React Query para lecturas: un 401/403/404 es terminal y
 * no se reintenta (repetirlo solo retrasa el estado de error); el resto conserva
 * los tres reintentos por defecto.
 */
export function reintentarSiNoEsTerminal(failureCount: number, error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return !(status !== undefined && ESTADOS_TERMINALES.has(status)) && failureCount < 3;
}
