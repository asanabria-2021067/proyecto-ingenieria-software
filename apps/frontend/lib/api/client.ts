const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || '/api';

function getApiUrl(): string {
  if (typeof window === 'undefined' || !API_URL) {
    return API_URL;
  }

  try {
    const configuredUrl = new URL(API_URL);
    const isLocalApiHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(
      configuredUrl.hostname,
    );
    const isLocalPageHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    if (isLocalApiHost && !isLocalPageHost) {
      return '';
    }

    // Mixed content: la página se sirve por https pero NEXT_PUBLIC_API_URL
    // quedó horneado en build time como http (típico si un proxy externo
    // añadió TLS después). El navegador bloquea ese fetch directo; en vez de
    // depender de rehornear el build, se usa el proxy same-origin de Next
    // (app/api/[...path]/route.ts), que reenvía la petición server-side sin
    // pasar por el navegador.
    if (window.location.protocol === 'https:' && configuredUrl.protocol === 'http:') {
      return '';
    }
  } catch {
    return API_URL;
  }

  return API_URL;
}

function joinUrl(base: string, prefix: string, path: string): string {
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPrefix}${normalizedPath}`;
}

// La sesión vive en cookies httpOnly (el JS del navegador no puede leer ni
// adjuntar el token) — `credentials: 'include'` es lo único necesario para
// que viajen en cada request, mismo origen o no (requiere CORS credentials
// true en el backend, ya configurado).
let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(joinUrl(getApiUrl(), API_PREFIX, '/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _retriedAfterRefresh = false,
): Promise<T> {
  // S7 (F005): con un body `FormData` NO se fija `Content-Type`: el navegador
  // debe generar el `multipart/form-data` con su propio `boundary`. Fijarlo a
  // mano rompe la carga de documentos de cierre (E107).
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(joinUrl(getApiUrl(), API_PREFIX, path), {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string>),
    },
  });

  // Access token (1h) expirado a mitad de sesión: un refresh silencioso vía
  // la cookie refresh_token (30d) evita mandar al usuario de vuelta al login
  // solo porque dejó la pestaña abierta un rato. Nunca para las propias
  // rutas /auth/* (evita el loop obvio de reintentar un refresh fallido).
  if (res.status === 401 && !_retriedAfterRefresh && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, options, true);
    }
  }

  if (!res.ok) {
    throw await buildApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

/**
 * Error enriquecido común a `apiFetch` y `apiFetchBlob`: `statusCode`,
 * `details` (mensaje crudo del backend) y, cuando viaja, el `code` de
 * dominio (p. ej. `REGISTRO_YA_REVOCADO`, `CLOSURE_NO_CONFIGURADO`) para que
 * la UI distinga conflictos sin comparar textos.
 */
async function buildApiError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  const error = new Error(
    Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Error del servidor',
  );
  (error as any).statusCode = body.statusCode ?? res.status;
  (error as any).details = body.message;
  if (typeof body.code === 'string') {
    (error as any).code = body.code;
  }
  return error;
}

/**
 * S7 (VIEW-20, F004) — lectura de BINARIO servido por el backend (bytes de
 * un documento de cierre). Misma sesión por cookie (`credentials: 'include'`)
 * y mismo refresh silencioso en 401 que `apiFetch`; a diferencia de este, no
 * fija `Content-Type` (no hay cuerpo) y pide `Accept: application/pdf`.
 * Devuelve un `Blob` que el llamador convierte en `objectURL` local. Nunca
 * recibe ni devuelve una URL del proveedor: `path` es siempre una ruta del
 * backend (la de `ReadGrant.url`).
 */
export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
  _retriedAfterRefresh = false,
): Promise<Blob> {
  const res = await fetch(joinUrl(getApiUrl(), API_PREFIX, path), {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/pdf',
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401 && !_retriedAfterRefresh && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetchBlob(path, options, true);
    }
  }

  if (!res.ok) {
    throw await buildApiError(res);
  }
  return res.blob();
}
