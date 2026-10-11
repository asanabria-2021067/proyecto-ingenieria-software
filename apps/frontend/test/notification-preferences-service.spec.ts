import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/session', () => ({ redirectToLoginOnSessionExpired: vi.fn() }));

import { redirectToLoginOnSessionExpired } from '../lib/api/session';
import {
  getNotificationPreferences,
  parseNotificationPreferences,
  updateNotificationPreference,
} from '../lib/services/notifications';

/**
 * FG03-C02 (T-328). Cliente de las preferencias de notificación de HU-185, con
 * el `apiFetch` real sobre un `fetch` simulado.
 */

const LISTA = [
  { tipo: 'TAREA_ASIGNADA', activa: true },
  { tipo: 'RECORDATORIO_EVENTO', activa: false },
];

function respuesta(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const fetchMock = vi.fn();
const llamada = (n = 0) => ({
  url: new URL(fetchMock.mock.calls[n][0] as string, 'http://localhost'),
  init: fetchMock.mock.calls[n][1] as RequestInit,
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('FG03-C02: getNotificationPreferences', () => {
  it('GET /notificaciones/preferencias con la sesión, sin parámetros ni id de usuario', async () => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    await expect(getNotificationPreferences()).resolves.toEqual(LISTA);

    const { url, init } = llamada();
    expect(url.pathname).toBe('/api/notificaciones/preferencias');
    expect(url.search).toBe('');
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('acepta cualquier número de tipos: no asume cuántos existen', async () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ tipo: `TIPO_${i}`, activa: i % 2 === 0 }));
    fetchMock.mockResolvedValue(respuesta(200, muchos));
    await expect(getNotificationPreferences()).resolves.toEqual(muchos);
    fetchMock.mockResolvedValue(respuesta(200, []));
    await expect(getNotificationPreferences()).resolves.toEqual([]);
  });
});

describe('FG03-C02: updateNotificationPreference', () => {
  it.each([
    ['TAREA_ASIGNADA', false],
    ['RECORDATORIO_EVENTO', true],
  ])('PUT /notificaciones/preferencias con { tipo: %s, activa: %s } y nada más', async (tipo, activa) => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    await updateNotificationPreference(tipo, activa);

    const { url, init } = llamada();
    expect(url.pathname).toBe('/api/notificaciones/preferencias');
    expect(url.search).toBe('');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toStrictEqual({ tipo, activa });
    // Booleano real: el backend rechaza "false" como texto.
    expect(typeof body.activa).toBe('boolean');
  });

  it('devuelve la lista que quedó guardada en el servidor, no lo que se pidió', async () => {
    const guardada = [{ tipo: 'TAREA_ASIGNADA', activa: true }];
    fetchMock.mockResolvedValue(respuesta(200, guardada));
    await expect(updateNotificationPreference('TAREA_ASIGNADA', false)).resolves.toEqual(guardada);
  });

  it('hace una sola petición por cambio: no existe un guardado por grupo ni por lote', async () => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    await updateNotificationPreference('TAREA_ASIGNADA', false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FG03-C02: errores del contrato', () => {
  it.each([
    [400, { statusCode: 400, message: ['tipo must be one of the following values: TAREA_ASIGNADA'] }, 'tipo must be one of the following values: TAREA_ASIGNADA'],
    [403, { statusCode: 403, message: 'Forbidden resource' }, 'Forbidden resource'],
    [429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 'ThrottlerException: Too Many Requests'],
    [500, {}, 'Error del servidor'],
  ])('un %i al guardar rechaza con su statusCode y no devuelve una lista', async (status, body, mensaje) => {
    fetchMock.mockResolvedValue(respuesta(status, body));
    await expect(updateNotificationPreference('TAREA_ASIGNADA', false)).rejects.toMatchObject({ statusCode: status, message: mensaje });
    expect(redirectToLoginOnSessionExpired).not.toHaveBeenCalled();
  });

  it.each([400, 403, 429, 500])('un %i al leer rechaza: nunca se convierte en una lista vacía', async (status) => {
    fetchMock.mockResolvedValue(respuesta(status, { statusCode: status, message: 'falló' }));
    await expect(getNotificationPreferences()).rejects.toMatchObject({ statusCode: status });
  });

  it('un 401 intenta renovar la sesión una vez y, si no puede, manda al login y rechaza', async () => {
    fetchMock.mockResolvedValue(respuesta(401, { statusCode: 401, message: 'Unauthorized' }));
    await expect(updateNotificationPreference('TAREA_ASIGNADA', false)).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchMock.mock.calls.map((call) => new URL(call[0] as string, 'http://localhost').pathname)).toEqual([
      '/api/notificaciones/preferencias',
      '/api/auth/refresh',
    ]);
    expect(redirectToLoginOnSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('una falla de red se propaga', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getNotificationPreferences()).rejects.toThrow('Failed to fetch');
  });
});

describe('FG03-C02: parseNotificationPreferences', () => {
  it('conserva solo { tipo, activa } y descarta lo que no tiene esa forma', () => {
    expect(
      parseNotificationPreferences([
        { tipo: 'TAREA_ASIGNADA', activa: true, idUsuario: 7, idPreferencia: 3, actualizadaEn: '2026-10-11' },
        { tipo: 'RECORDATORIO_EVENTO', activa: 'false' },
        { tipo: '', activa: true },
        { tipo: 9, activa: true },
        { activa: true },
        null,
        'TAREA_ASIGNADA',
      ]),
    ).toEqual([{ tipo: 'TAREA_ASIGNADA', activa: true }]);
  });

  it.each([null, undefined, 'texto', 7, {}, { data: [] }])('una respuesta que no es una lista (%j) da []', (raw) => {
    expect(parseNotificationPreferences(raw)).toEqual([]);
  });
});

describe('FG04-C05: el cliente no cambia la entrega', () => {
  it('el tipo viaja solo en el cuerpo JSON: un valor extraño no altera la ruta ni la consulta', async () => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    const raro = 'X/../../admin?activa=true&tipo=Y';
    await updateNotificationPreference(raro, true);
    const { url, init } = llamada();
    expect(url.pathname).toBe('/api/notificaciones/preferencias');
    expect(url.search).toBe('');
    expect(JSON.parse(init.body as string)).toStrictEqual({ tipo: raro, activa: true });
  });

  it('leer preferencias nunca escribe y guardar nunca usa otro método que PUT', async () => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    await getNotificationPreferences();
    await updateNotificationPreference('TAREA_ASIGNADA', true);
    expect(fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method ?? 'GET')).toEqual(['GET', 'PUT']);
  });

  it('solo existen rutas de preferencias: el cliente no llama a notificaciones, chat ni mensajes', async () => {
    fetchMock.mockResolvedValue(respuesta(200, LISTA));
    await getNotificationPreferences();
    await updateNotificationPreference('TAREA_ASIGNADA', false);
    const rutas = fetchMock.mock.calls.map((call) => new URL(call[0] as string, 'http://localhost').pathname);
    expect(new Set(rutas)).toEqual(new Set(['/api/notificaciones/preferencias']));
  });
});
