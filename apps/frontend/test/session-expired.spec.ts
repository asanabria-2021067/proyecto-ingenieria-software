import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { apiFetch, apiFetchBlob } from '../lib/api/client';
import {
  __resetSessionRedirectForTests,
  buildLoginUrl,
  getSafeNextPath,
  MOTIVO_SESION_EXPIRADA,
} from '../lib/api/session';
import { getApiErrorMessage, MENSAJE_SESION_EXPIRADA } from '../components/projects/api-error';
import { middleware } from '../middleware';

/**
 * T-221 — sesión vencida (redirección al login conservando la intención) y
 * registro técnico del error original sin datos sensibles.
 */

const originalLocation = window.location;
let assignMock: ReturnType<typeof vi.fn>;

function simularUbicacion(url: string) {
  const parsed = new URL(url, 'http://localhost');
  assignMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: parsed.pathname, search: parsed.search, assign: assignMock },
  });
}

function respuesta(status: number, body: unknown = {}): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** Petición original 401 + refresh fallido. */
function mockSesionVencida() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(respuesta(401, { statusCode: 401, message: 'Unauthorized' }))
    .mockResolvedValueOnce(respuesta(401));
}

beforeEach(() => {
  __resetSessionRedirectForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('T-221: sesión vencida', () => {
  it('refresh fallido en el dashboard → redirige al login con la ruta actual y el motivo', async () => {
    simularUbicacion('/dashboard/proyectos/123?tab=sprints');
    mockSesionVencida();

    const error = await apiFetch('/proyectos/123').catch((e: unknown) => e);

    expect(assignMock).toHaveBeenCalledTimes(1);
    const destino = new URL(assignMock.mock.calls[0][0], 'http://localhost');
    expect(destino.pathname).toBe('/login');
    expect(destino.searchParams.get('next')).toBe('/dashboard/proyectos/123?tab=sprints');
    expect(destino.searchParams.get('motivo')).toBe(MOTIVO_SESION_EXPIRADA);
    // El error se sigue propagando: la UI no queda colgada y lo traduce.
    expect(getApiErrorMessage(error, 'general')).toBe(MENSAJE_SESION_EXPIRADA);
  });

  it('varias peticiones fallando a la vez → una sola redirección', async () => {
    simularUbicacion('/dashboard');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401));

    await Promise.all([apiFetch('/a').catch(() => {}), apiFetch('/b').catch(() => {})]);

    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it('refresh exitoso → no redirige (se conserva el refresh silencioso existente)', async () => {
    simularUbicacion('/dashboard');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respuesta(401))
      .mockResolvedValueOnce(respuesta(200))
      .mockResolvedValueOnce(respuesta(200, { ok: true }));

    await expect(apiFetch('/x')).resolves.toEqual({ ok: true });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('401 fuera del dashboard (login/landing) → no redirige, evita el bucle', async () => {
    simularUbicacion('/login');
    mockSesionVencida();

    await apiFetch('/usuarios/me').catch(() => {});

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('401 en /auth/* (credenciales inválidas) → no es sesión vencida', async () => {
    simularUbicacion('/dashboard');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(respuesta(401, { message: 'Credenciales invalidas' }));

    await apiFetch('/auth/login', { method: 'POST' }).catch(() => {});

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('apiFetchBlob aplica el mismo manejo de sesión', async () => {
    simularUbicacion('/dashboard/admin/proyectos/7/cierre');
    mockSesionVencida();

    await apiFetchBlob('/documentos/1').catch(() => {});

    expect(assignMock).toHaveBeenCalledWith(
      buildLoginUrl('/dashboard/admin/proyectos/7/cierre', MOTIVO_SESION_EXPIRADA),
    );
  });

  it('middleware: sin cookie en una ruta protegida → login con next', () => {
    const res = middleware(new NextRequest('http://localhost/dashboard/proyectos/123?tab=equipo'));
    const destino = new URL(res.headers.get('location') ?? '');
    expect(destino.pathname).toBe('/login');
    expect(destino.searchParams.get('next')).toBe('/dashboard/proyectos/123?tab=equipo');
    expect(destino.searchParams.get('motivo')).toBeNull();
  });
});

describe('T-221: next seguro tras el login', () => {
  it('acepta solo rutas internas del dashboard', () => {
    expect(getSafeNextPath('/dashboard/proyectos/123')).toBe('/dashboard/proyectos/123');
    expect(getSafeNextPath('/dashboard')).toBe('/dashboard');
  });

  it.each([
    'https://evil.com/dashboard',
    '//evil.com/dashboard',
    '/\\evil.com',
    'javascript:alert(1)',
    '/login',
    '/dashboardx',
    '',
    null,
  ])('rechaza %s', (valor) => {
    expect(getSafeNextPath(valor)).toBeNull();
  });

  it('buildLoginUrl descarta un next inseguro', () => {
    expect(buildLoginUrl('//evil.com')).toBe('/login');
  });
});

describe('T-221: registro técnico del error original', () => {
  it('4xx → console.warn con método, endpoint, status, code, mensaje y detalles originales', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      respuesta(409, { statusCode: 409, message: 'La revisión cambió', code: 'REVISION_CAMBIO' }),
    );

    await apiFetch('/proyectos/5/cierre', { method: 'post', body: JSON.stringify({}) }).catch(() => {});

    expect(console.warn).toHaveBeenCalledWith(expect.any(String), {
      method: 'POST',
      endpoint: '/proyectos/5/cierre',
      status: 409,
      code: 'REVISION_CAMBIO',
      message: 'La revisión cambió',
      details: 'La revisión cambió',
    });
  });

  it('5xx → console.error con el mensaje técnico original (el usuario ve el genérico)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      respuesta(500, { statusCode: 500, message: 'Internal server error' }),
    );

    await apiFetch('/x').catch(() => {});

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 500, message: 'Internal server error', endpoint: '/x' }),
    );
  });

  it('fallo de red → console.error y el error se propaga', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(apiFetch('/x')).rejects.toThrow('Failed to fetch');
    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ endpoint: '/x', message: 'Failed to fetch' }),
    );
  });

  it('no registra el cuerpo de la petición, headers ni la query string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      respuesta(401, { statusCode: 401, message: 'Credenciales invalidas' }),
    );

    await apiFetch('/auth/login?correo=ana@uvg.edu.gt', {
      method: 'POST',
      body: JSON.stringify({ correo: 'ana@uvg.edu.gt', contrasena: 'SuperSecreta123' }),
      headers: { Authorization: 'Bearer token-secreto' },
    }).catch(() => {});

    const registrado = JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(registrado).toContain('/auth/login');
    expect(registrado).not.toMatch(/SuperSecreta123|token-secreto|ana@uvg\.edu\.gt|contrasena/);
  });
});
