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

type ErrorHttp = { statusCode?: number; retryAfterMs?: number } | null | undefined;

/** IESUC-568 (C2): solo un 401 significa que no hay sesión (apiFetch ya intentó el refresh). */
export function esErrorDeSesion(error: unknown): boolean {
  return (error as ErrorHttp)?.statusCode === 401;
}

/** 429 o fallo de red (sin respuesta HTTP): puede resolverse solo si se espera. */
export function esErrorTransitorio(error: unknown): boolean {
  const status = (error as ErrorHttp)?.statusCode;
  return status === undefined || status === 429;
}

export const REINTENTOS_SESION = 3;
const ESPERA_MAXIMA_MS = 30_000;

/** `retry` de la sesión: solo errores transitorios y como mucho REINTENTOS_SESION veces. */
export function reintentarSesionTransitoria(failureCount: number, error: unknown): boolean {
  return esErrorTransitorio(error) && failureCount < REINTENTOS_SESION;
}

/** `retryDelay`: respeta Retry-After si el servidor lo envió; si no, 1 s, 2 s, 4 s… (tope 30 s). */
export function esperaExponencial(failureCount: number, error: unknown): number {
  const retryAfterMs = (error as ErrorHttp)?.retryAfterMs;
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, ESPERA_MAXIMA_MS * 2);
  }
  return Math.min(1000 * 2 ** failureCount, ESPERA_MAXIMA_MS);
}
