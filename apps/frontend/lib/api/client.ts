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

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(joinUrl(getApiUrl(), API_PREFIX, path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(
      Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Error del servidor',
    );
    (error as any).statusCode = body.statusCode;
    (error as any).details = body.message;
    throw error;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export function getUserIdFromToken(): number | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
