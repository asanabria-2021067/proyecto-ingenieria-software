/**
 * T-221 — sesión vencida: llevar al login conservando a dónde iba el usuario.
 *
 * Reutiliza el mecanismo existente (cookies httpOnly + refresh silencioso de
 * `apiFetch` + middleware de `/dashboard`); aquí solo se decide la URL de
 * login y se valida el `next` para que no sea un open redirect.
 */

export const LOGIN_PATH = '/login';
export const MOTIVO_SESION_EXPIRADA = 'sesion-expirada';

const PROTECTED_PREFIX = '/dashboard';

/**
 * `next` aceptable: solo rutas internas del dashboard. Se rechaza cualquier
 * URL absoluta, protocolo-relativa (`//x`) o con `\` (que algunos navegadores
 * normalizan a `/`), para no redirigir fuera de la aplicación tras el login.
 */
export function getSafeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const pathname = raw.split(/[?#]/)[0];
  if (pathname !== PROTECTED_PREFIX && !pathname.startsWith(`${PROTECTED_PREFIX}/`)) return null;
  return raw;
}

export function buildLoginUrl(next?: string | null, motivo?: string): string {
  const params = new URLSearchParams();
  const safeNext = getSafeNextPath(next);
  if (safeNext) params.set('next', safeNext);
  if (motivo) params.set('motivo', motivo);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

/** `next` de la URL actual del login (sin `useSearchParams`, que exige Suspense). */
export function readNextFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return getSafeNextPath(new URLSearchParams(window.location.search).get('next'));
}

let redirigiendo = false;

/**
 * El refresh silencioso ya falló: la sesión no se puede renovar. Solo actúa
 * dentro del dashboard (en login/landing un 401 es el estado normal y
 * redirigir provocaría un bucle) y una sola vez aunque fallen varias
 * peticiones en paralelo. La navegación completa descarta la caché de React
 * Query del usuario anterior. El aviso lo muestra la página de login a partir
 * de `motivo`, porque un toast aquí se perdería con la navegación.
 */
export function redirectToLoginOnSessionExpired(): void {
  if (typeof window === 'undefined' || redirigiendo) return;
  const { pathname, search } = window.location;
  if (pathname !== PROTECTED_PREFIX && !pathname.startsWith(`${PROTECTED_PREFIX}/`)) return;
  redirigiendo = true;
  window.location.assign(buildLoginUrl(`${pathname}${search}`, MOTIVO_SESION_EXPIRADA));
}

/** Solo para pruebas: reinicia la protección contra redirecciones repetidas. */
export function __resetSessionRedirectForTests(): void {
  redirigiendo = false;
}
