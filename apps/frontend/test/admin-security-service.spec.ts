import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/session', () => ({ redirectToLoginOnSessionExpired: vi.fn() }));

import { redirectToLoginOnSessionExpired } from '../lib/api/session';
import { getSecurityEvents, parseSecurityEventsPage, securityEventsSearchParams } from '../lib/services/admin-security';
import { SECURITY_EVENT_TYPES } from '../lib/types/admin-security';

/**
 * FG02-C01 (T-310). Cliente del visor de eventos de seguridad, con el
 * `apiFetch` real sobre un `fetch` simulado.
 */

const EVENTO = {
  id: 31,
  tipo: 'USER_STATUS_CHANGED',
  fecha: '2026-10-11T06:00:00.000Z',
  actor: { idUsuario: 7, nombre: 'Ada Admin' },
  cuenta: { idUsuario: 8, nombre: 'Eva Estudiante' },
  origen: { ip: '203.0.113.9', ipConfiable: false },
  detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
};
const PAGINA = { data: [EVENTO], total: 1, page: 1, totalPages: 1, tipos: [...SECURITY_EVENT_TYPES] };

function respuesta(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const fetchMock = vi.fn();
const urlPedida = () => new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');

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

describe('FG02-C01: getSecurityEvents — URL y filtros', () => {
  it('sin filtros pide GET /admin/eventos-seguridad con page=1 y limit=20, con credenciales', async () => {
    fetchMock.mockResolvedValue(respuesta(200, PAGINA));
    await getSecurityEvents();
    expect(urlPedida().pathname).toBe('/api/admin/eventos-seguridad');
    expect(urlPedida().search).toBe('?page=1&limit=20');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it('serializa todos los filtros válidos y codifica el desplazamiento horario', async () => {
    fetchMock.mockResolvedValue(respuesta(200, PAGINA));
    await getSecurityEvents({
      tipo: 'LOGIN_FAILED',
      desde: '2026-10-11T00:00:00.000-06:00',
      hasta: '2026-10-11T23:59:59.999-06:00',
      idUsuario: 8,
      page: 3,
      limit: 10,
    });
    expect(Object.fromEntries(urlPedida().searchParams)).toEqual({
      tipo: 'LOGIN_FAILED',
      desde: '2026-10-11T00:00:00.000-06:00',
      hasta: '2026-10-11T23:59:59.999-06:00',
      idUsuario: '8',
      page: '3',
      limit: '10',
    });
    // `+` y `:` van codificados: un `+` sin codificar llegaría como espacio.
    expect(securityEventsSearchParams({ desde: '2026-10-11T08:00:00+02:00' }).toString()).toContain(
      'desde=2026-10-11T08%3A00%3A00%2B02%3A00',
    );
  });

  it.each([
    ['tipo fuera del catálogo', { tipo: 'TASK_CREATED' }],
    ['tipo vacío', { tipo: '' }],
    ['fechas vacías', { desde: '', hasta: '   ' }],
    ['idUsuario cero', { idUsuario: 0 }],
    ['idUsuario negativo', { idUsuario: -3 }],
    ['idUsuario decimal', { idUsuario: 1.5 }],
    ['idUsuario NaN', { idUsuario: Number.NaN }],
    ['filtros indefinidos', { tipo: undefined, desde: undefined, hasta: undefined, idUsuario: undefined }],
  ])('omite %s en vez de enviar un parámetro vacío', (_nombre, query) => {
    expect(securityEventsSearchParams(query as never).toString()).toBe('page=1&limit=20');
  });

  it.each([
    [{ page: 0 }, 'page=1&limit=20'],
    [{ page: -2 }, 'page=1&limit=20'],
    [{ page: 2.5 }, 'page=1&limit=20'],
    [{ limit: 0 }, 'page=1&limit=20'],
    [{ limit: 500 }, 'page=1&limit=50'],
    [{ limit: 50 }, 'page=1&limit=50'],
  ])('normaliza la paginación %j', (query, esperado) => {
    expect(securityEventsSearchParams(query).toString()).toBe(esperado);
  });

  it('nunca envía claves que el contrato no define', () => {
    const params = securityEventsSearchParams({ tipo: 'LOGIN_FAILED', orderBy: 'detalleJson', tipoObjeto: 'TAREA' } as never);
    expect([...params.keys()]).toEqual(['tipo', 'page', 'limit']);
  });

  it('propaga la señal de cancelación', async () => {
    fetchMock.mockResolvedValue(respuesta(200, PAGINA));
    const controller = new AbortController();
    await getSecurityEvents({}, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('FG02-C01: getSecurityEvents — respuesta', () => {
  it('devuelve la página tal como la define el contrato', async () => {
    fetchMock.mockResolvedValue(respuesta(200, PAGINA));
    await expect(getSecurityEvents()).resolves.toEqual(PAGINA);
  });

  it('descarta todo campo ajeno al contrato, aunque el servidor lo enviara', () => {
    const pagina = parseSecurityEventsPage({
      ...PAGINA,
      debug: { sql: 'select *' },
      data: [
        {
          ...EVENTO,
          detalleJson: { token: 'tok-secreto' },
          correo: 'eva@uvg.edu.gt',
          actor: { ...EVENTO.actor, correo: 'ada@uvg.edu.gt', contrasena: 'hash' },
          origen: { ...EVENTO.origen, userAgent: 'curl', xff: '10.0.0.1' },
          detalle: { ...EVENTO.detalle, anidado: { secret: 'x' }, lista: ['tok-secreto'], nulo: null },
        },
      ],
    });
    expect(pagina).toEqual(PAGINA);
    expect(JSON.stringify(pagina)).not.toMatch(/tok-secreto|uvg\.edu\.gt|hash|curl|select/);
  });

  it.each([
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [undefined, false],
  ])('ipConfiable=%j del servidor se lee como %j', (recibido, esperado) => {
    const pagina = parseSecurityEventsPage({ ...PAGINA, data: [{ ...EVENTO, origen: { ip: '203.0.113.9', ipConfiable: recibido } }] });
    expect(pagina.data[0].origen).toEqual({ ip: '203.0.113.9', ipConfiable: esperado });
  });

  it('actor, cuenta, IP y nombre ausentes quedan en null', () => {
    const pagina = parseSecurityEventsPage({
      ...PAGINA,
      data: [{ ...EVENTO, actor: null, cuenta: { idUsuario: 99, nombre: null }, origen: { ip: null, ipConfiable: false }, detalle: {} }],
    });
    expect(pagina.data[0]).toMatchObject({
      actor: null,
      cuenta: { idUsuario: 99, nombre: null },
      origen: { ip: null, ipConfiable: false },
      detalle: {},
    });
  });

  it('descarta eventos con un tipo fuera del catálogo o sin identidad', () => {
    const pagina = parseSecurityEventsPage({
      ...PAGINA,
      data: [{ ...EVENTO, tipo: 'TASK_CREATED' }, { ...EVENTO, id: 'x' }, { ...EVENTO, fecha: 7 }, null, 'evento', EVENTO],
      tipos: [...SECURITY_EVENT_TYPES, 'TASK_CREATED', 7],
    });
    expect(pagina.data).toEqual([EVENTO]);
    expect(pagina.tipos).toEqual([...SECURITY_EVENT_TYPES]);
  });

  it.each([null, undefined, 'texto', 7, [], {}])('una respuesta sin forma (%j) da una página vacía, no un fallo', (raw) => {
    expect(parseSecurityEventsPage(raw)).toEqual({ data: [], total: 0, page: 1, totalPages: 0, tipos: [] });
  });
});

describe('FG02-C01: getSecurityEvents — errores', () => {
  it.each([
    [400, { statusCode: 400, message: ['tipo debe ser uno de: LOGIN_FAILED'] }, 'tipo debe ser uno de: LOGIN_FAILED'],
    [403, { statusCode: 403, message: 'Acceso restringido a administradores' }, 'Acceso restringido a administradores'],
    [429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 'ThrottlerException: Too Many Requests'],
    [500, {}, 'Error del servidor'],
  ])('un %i rechaza con statusCode y el mensaje del backend', async (status, body, mensaje) => {
    fetchMock.mockResolvedValue(respuesta(status, body));
    await expect(getSecurityEvents()).rejects.toMatchObject({ statusCode: status, message: mensaje });
    expect(redirectToLoginOnSessionExpired).not.toHaveBeenCalled();
  });

  it('un 401 intenta renovar la sesión una vez y, si no puede, manda al login y rechaza', async () => {
    fetchMock.mockResolvedValue(respuesta(401, { statusCode: 401, message: 'Unauthorized' }));
    await expect(getSecurityEvents()).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchMock.mock.calls.map((call) => new URL(call[0] as string, 'http://localhost').pathname)).toEqual([
      '/api/admin/eventos-seguridad',
      '/api/auth/refresh',
    ]);
    expect(redirectToLoginOnSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('una falla de red se propaga sin convertirse en una página vacía', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getSecurityEvents()).rejects.toThrow('Failed to fetch');
  });
});
