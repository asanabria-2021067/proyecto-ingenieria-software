import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, MENSAJE_ERROR_GENERICO } from '../components/projects/api-error';

function enrichedError(statusCode: number, message = 'detalle interno'): Error {
  return Object.assign(new Error(message), { statusCode });
}

describe('getApiErrorMessage', () => {
  it('400 en contexto de tarea: usa el mensaje del backend si existe (HU-147/T-185: idHito obligatorio/no removible)', () => {
    expect(
      getApiErrorMessage(
        enrichedError(
          400,
          'idHito es obligatorio: la tarea necesita un hito asignado antes de poder entrar al tablero o a un sprint',
        ),
        'task',
      ),
    ).toBe('idHito es obligatorio: la tarea necesita un hito asignado antes de poder entrar al tablero o a un sprint');
  });

  it('400 en contexto de tarea sin mensaje del backend: cae en el mensaje genérico sobre datos/relaciones', () => {
    expect(getApiErrorMessage(Object.assign(new Error(), { statusCode: 400 }), 'task')).toBe(
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

describe('getApiErrorMessage — scope calendar (G03-C02, UI-21)', () => {
  it('404: habla del evento o el proyecto, nunca de tareas ni etiquetas', () => {
    const mensaje = getApiErrorMessage(enrichedError(404, 'Not Found'), 'calendar');
    expect(mensaje).toBe('El evento o el proyecto ya no está disponible. Actualiza la información e inténtalo nuevamente.');
    expect(mensaje).not.toMatch(/tarea|etiqueta|404|Not Found/i);
  });

  it('404 en otros scopes no cambia (task sigue hablando de tarea/etiqueta; general de lo buscado)', () => {
    expect(getApiErrorMessage(enrichedError(404), 'task')).toContain('La tarea, etiqueta o proyecto');
    expect(getApiErrorMessage(enrichedError(404), 'general')).toContain('No encontramos lo que buscabas');
  });

  it('403 conserva el mensaje de permisos y no se confunde con "no existe"', () => {
    const mensaje = getApiErrorMessage(enrichedError(403, 'Forbidden resource'), 'calendar');
    expect(mensaje).toMatch(/^No tienes permisos para realizar esta acción\./);
    expect(mensaje).not.toMatch(/no está disponible|Forbidden/);
  });

  it('500: mensaje genérico seguro, sin el texto del servidor', () => {
    expect(getApiErrorMessage(enrichedError(500, 'PrismaClientKnownRequestError: P2002'), 'calendar')).toBe(MENSAJE_ERROR_GENERICO);
  });

  it('400 y 409 del calendario muestran el mensaje funcional del backend cuando es legible', () => {
    expect(getApiErrorMessage(enrichedError(400, 'El inicio debe ser anterior al fin.'), 'calendar')).toBe('El inicio debe ser anterior al fin.');
    expect(getApiErrorMessage(enrichedError(409, 'Ya existe un evento en ese horario.'), 'calendar')).toBe('Ya existe un evento en ese horario.');
  });
});
