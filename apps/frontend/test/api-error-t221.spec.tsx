import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { apiFetch } from '../lib/api/client';
import {
  getApiErrorMessage,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_SESION_EXPIRADA,
  traducirMensajeValidacion,
} from '../components/projects/api-error';
import DashboardError from '../app/dashboard/error';

/**
 * T-221 — los errores se construyen con el `apiFetch` real a partir de
 * cuerpos con el formato que devuelve Nest (`{ statusCode, message, error }`),
 * para probar la traducción integrada con el cliente HTTP existente.
 */
function respuesta(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

async function errorDelBackend(status: number, body: unknown, path = '/proyectos/1'): Promise<unknown> {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(status, body));
  try {
    await apiFetch(path);
  } catch (error) {
    return error;
  }
  throw new Error('apiFetch debía rechazar');
}

const CODIGO_SUELTO = /^\s*\d{3}\b/;

describe('T-221: traducción de errores del backend', () => {
  beforeEach(() => {
    // `apiFetch` registra el error técnico; aquí solo interesa la traducción.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('403 → mensaje de permisos en español con qué hacer, sin el código', async () => {
    const error = await errorDelBackend(403, { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' });
    const mensaje = getApiErrorMessage(error, 'general');
    expect(mensaje).toContain('No tienes permisos para realizar esta acción');
    expect(mensaje).toMatch(/contacta/i);
    expect(mensaje).not.toMatch(/403|Forbidden/);
  });

  it('404 → recurso no disponible en español', async () => {
    const error = await errorDelBackend(404, { statusCode: 404, message: 'Cannot GET /api/x', error: 'Not Found' });
    const mensaje = getApiErrorMessage(error, 'general');
    expect(mensaje).toMatch(/no está disponible/);
    expect(mensaje).not.toMatch(/404|Cannot GET/);
  });

  it('409 con mensaje de dominio del backend → se conserva (ya es legible)', async () => {
    const error = await errorDelBackend(409, {
      statusCode: 409,
      message: 'Ya existe una solicitud de salida pendiente para este proyecto',
      error: 'Conflict',
    });
    expect(getApiErrorMessage(error, 'task')).toBe('Ya existe una solicitud de salida pendiente para este proyecto');
  });

  it('409 sin información útil → mensaje genérico de conflicto que orienta, sin inventar causa', async () => {
    const error = await errorDelBackend(409, { statusCode: 409, message: 'Conflict' });
    const mensaje = getApiErrorMessage(error, 'task');
    expect(mensaje).toMatch(/Actualiza la información e inténtalo nuevamente/);
    expect(mensaje).not.toMatch(/409|Conflict/);
  });

  it('409 con texto de restricción de base de datos → nunca se muestra', async () => {
    const error = await errorDelBackend(409, { statusCode: 409, message: 'Unique constraint failed on the fields: (`nombre`)' });
    expect(getApiErrorMessage(error, 'task')).not.toMatch(/constraint/i);
  });

  it('400 con el array real de class-validator → validación legible por campo', async () => {
    const error = await errorDelBackend(400, {
      statusCode: 400,
      message: [
        'tituloProyecto should not be empty',
        'fechaFinEstimada must be a valid ISO 8601 date string',
        'cupos must not be less than 1',
        'property foo should not exist',
      ],
      error: 'Bad Request',
    });
    const mensaje = getApiErrorMessage(error, 'task');
    expect(mensaje).toContain('El campo «titulo proyecto» es obligatorio.');
    expect(mensaje).toContain('El campo «fecha fin estimada» debe ser una fecha válida.');
    expect(mensaje).toContain('El campo «cupos» debe ser mayor o igual a 1.');
    expect(mensaje).toContain('El campo «foo» no está permitido.');
    expect(mensaje).not.toMatch(/should|must|Bad Request/);
  });

  it('400 con regla de negocio en español → se muestra tal cual en scopes que la exponen', async () => {
    const error = await errorDelBackend(400, {
      statusCode: 400,
      message: 'No existe una solicitud de salida en estado PREPARACION',
    });
    expect(getApiErrorMessage(error, 'general')).toBe('No existe una solicitud de salida en estado PREPARACION');
  });

  it('422 con detalle de validación → también se traduce', async () => {
    const error = await errorDelBackend(422, { statusCode: 422, message: ['correo must be an email'] });
    expect(getApiErrorMessage(error, 'general')).toBe('El campo «correo» debe ser un correo electrónico válido.');
  });

  it('401 tras refresh fallido → mensaje de sesión vencida', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(respuesta(401, { statusCode: 401, message: 'Unauthorized' }))
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    const error = await apiFetch('/usuarios/me').catch((e: unknown) => e);
    expect(getApiErrorMessage(error, 'general')).toBe(MENSAJE_SESION_EXPIRADA);
  });

  it('401 en login (scope auth) → credenciales, no sesión vencida', async () => {
    const error = await errorDelBackend(401, { statusCode: 401, message: 'Credenciales invalidas' }, '/auth/login');
    expect(getApiErrorMessage(error, 'auth')).toBe('Credenciales invalidas');
  });

  it('500 → mensaje genérico, nunca el código ni el texto técnico', async () => {
    const error = await errorDelBackend(500, { statusCode: 500, message: 'Internal server error' });
    const mensaje = getApiErrorMessage(error, 'general');
    expect(mensaje).toBe(MENSAJE_ERROR_GENERICO);
    expect(mensaje).not.toMatch(CODIGO_SUELTO);
  });

  it('500 con fallback de contexto → usa el contexto de la pantalla', async () => {
    const error = await errorDelBackend(500, { statusCode: 500, message: 'Internal server error' });
    expect(getApiErrorMessage(error, 'general', 'No fue posible cargar la bitácora.')).toBe(
      'No fue posible cargar la bitácora.',
    );
  });

  it('respuesta sin cuerpo JSON → genérico, no «Error del servidor»', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);
    const error = await apiFetch('/x').catch((e: unknown) => e);
    expect(getApiErrorMessage(error, 'general')).toBe(MENSAJE_ERROR_GENERICO);
  });

  it('fallo de red (TypeError: Failed to fetch) → genérico', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiFetch('/x').catch((e: unknown) => e);
    expect(getApiErrorMessage(error, 'general')).toBe(MENSAJE_ERROR_GENERICO);
  });

  it('la traducción no destruye el error técnico original', async () => {
    const error = await errorDelBackend(409, { statusCode: 409, message: 'Conflict', code: 'X_CODE' });
    getApiErrorMessage(error, 'task');
    expect(error).toMatchObject({ message: 'Conflict', statusCode: 409, code: 'X_CODE', details: 'Conflict' });
  });

  it('traducirMensajeValidacion devuelve null para mensajes que no son de class-validator', () => {
    expect(traducirMensajeValidacion('El Sprint ya no está en estado ACTIVO')).toBeNull();
    expect(traducirMensajeValidacion('roles.0.cupos must be an integer number')).toBe(
      'El campo «roles › cupos» debe ser un número entero.',
    );
  });
});

describe('T-221: error no contemplado en el dashboard', () => {
  it('muestra el mensaje genérico con reintento (sin pantalla en blanco ni texto técnico) y registra el error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = new TypeError("Cannot read properties of undefined (reading 'nombre')");

    render(<DashboardError error={original} reset={() => {}} />);

    expect(screen.getByRole('alert')).toHaveTextContent(MENSAJE_ERROR_GENERICO);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Cannot read/);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), original);
    consoleSpy.mockRestore();
  });
});

describe('T-221: reglas de class-validator traducidas', () => {
  it.each([
    ['property foo should not exist', 'El campo «foo» no está permitido.'],
    ['nombre should not be empty', 'El campo «nombre» es obligatorio.'],
    ['nombre should not be null or undefined', 'El campo «nombre» es obligatorio.'],
    ['nombre must be longer than or equal to 3 characters', 'El campo «nombre» debe tener al menos 3 caracteres.'],
    ['nombre must be shorter than or equal to 50 characters', 'El campo «nombre» no puede superar 50 caracteres.'],
    ['cupos must not be less than 1', 'El campo «cupos» debe ser mayor o igual a 1.'],
    ['horas must not be greater than 40', 'El campo «horas» debe ser menor o igual a 40.'],
    ['horas must be a positive number', 'El campo «horas» debe ser un número positivo.'],
    ['cupos must be an integer number', 'El campo «cupos» debe ser un número entero.'],
    ['horas must be a number conforming to the specified constraints', 'El campo «horas» debe ser un número.'],
    ['nombre must be a string', 'El campo «nombre» debe ser un texto.'],
    ['obligatorio must be a boolean value', 'El campo «obligatorio» debe ser verdadero o falso.'],
    ['correo must be an email', 'El campo «correo» debe ser un correo electrónico válido.'],
    ['roles must be an array', 'El campo «roles» debe ser una lista.'],
    ['roles must contain at least 1 elements', 'El campo «roles» debe tener al menos 1 elementos.'],
    ['roles must contain no more than 10 elements', 'El campo «roles» debe tener como máximo 10 elementos.'],
    ['estado must be one of the following values: ACTIVO, CERRADO', 'El campo «estado» tiene un valor no permitido.'],
    ['estado must be a valid enum value', 'El campo «estado» tiene un valor no permitido.'],
    ['fechaInicio must be a Date instance', 'El campo «fecha inicio» debe ser una fecha válida.'],
    ['carne must match /^\d+$/ regular expression', 'El campo «carne» tiene un formato no válido.'],
    ['urlRecursoExterno must be a URL address', 'El campo «url recurso externo» tiene un formato no válido.'],
  ])('%s', (entrada, esperado) => {
    expect(traducirMensajeValidacion(entrada)).toBe(esperado);
  });
});
