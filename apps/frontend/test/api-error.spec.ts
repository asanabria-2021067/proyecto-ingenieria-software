import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, MENSAJE_ERROR_GENERICO } from '../components/projects/api-error';

function enrichedError(statusCode: number, message = 'detalle interno'): Error {
  return Object.assign(new Error(message), { statusCode });
}

describe('getApiErrorMessage', () => {
  it('400: mensaje fijo sobre datos/relaciones', () => {
    expect(getApiErrorMessage(enrichedError(400), 'task')).toBe(
      'Revisa los datos ingresados y las relaciones seleccionadas.',
    );
  });

  it('403: mensaje fijo de permisos', () => {
    expect(getApiErrorMessage(enrichedError(403), 'task')).toMatch(
      /^No tienes permisos para realizar esta acción\./,
    );
  });

  it('404: mensaje fijo de recurso no disponible', () => {
    expect(getApiErrorMessage(enrichedError(404), 'task')).toContain('ya no está disponible');
  });

  it('409 en contexto de etiqueta: conflicto de nombre duplicado', () => {
    expect(getApiErrorMessage(enrichedError(409), 'label')).toBe(
      'Ya existe una etiqueta con ese nombre.',
    );
  });

  it('409 en contexto de asignación: conflicto de asignación concurrente', () => {
    expect(getApiErrorMessage(enrichedError(409), 'assignment')).toContain('La asignación cambió');
  });

  it('409 en contexto de tarea genérico: usa el mensaje del backend si existe', () => {
    expect(getApiErrorMessage(enrichedError(409, 'Conflicto real del backend'), 'task')).toBe(
      'Conflicto real del backend',
    );
  });

  it('500: nunca muestra el texto del servidor, siempre el mensaje genérico (T-221)', () => {
    expect(getApiErrorMessage(enrichedError(500, 'Error interno'), 'task')).toBe(MENSAJE_ERROR_GENERICO);
    expect(getApiErrorMessage(Object.assign(new Error(), { statusCode: 500 }), 'task')).toBe(
      MENSAJE_ERROR_GENERICO,
    );
  });

  it('no muta ni destruye el objeto de error original', () => {
    const error = enrichedError(400);
    const snapshot = { ...error, message: error.message, statusCode: (error as any).statusCode };
    getApiErrorMessage(error, 'task');
    expect(error.message).toBe(snapshot.message);
    expect((error as any).statusCode).toBe(snapshot.statusCode);
  });

  it('un error sin statusCode reconocible cae en el mensaje por defecto', () => {
    expect(getApiErrorMessage(new Error('algo raro'), 'task')).toBe('algo raro');
    expect(getApiErrorMessage(null, 'task')).toBe(MENSAJE_ERROR_GENERICO);
  });
});
