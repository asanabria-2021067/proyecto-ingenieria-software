import { describe, expect, it } from 'vitest';
import {
  CLOSURE_DOCUMENT_MAX_BYTES,
  getApiErrorCode,
  getApiErrorMessage,
  getFileTooLargeMessage,
  isClosureNoConfigurado,
  isProyectoOcupado,
  isRegistroYaRevocado,
} from '../components/projects/api-error';

function enrichedError(statusCode: number, message = 'detalle interno', extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

describe('getApiErrorMessage — Sprint 7 (scopes y estados 413/422/503)', () => {
  it('413: mensaje con el límite explícito en MiB', () => {
    const msg = getApiErrorMessage(enrichedError(413), 'closure');
    expect(msg).toContain('10 MiB');
  });

  it('getFileTooLargeMessage incluye el tamaño real del archivo y el límite', () => {
    const msg = getFileTooLargeMessage(12 * 1_048_576);
    expect(msg).toContain('12 MiB');
    expect(msg).toContain('10 MiB');
    expect(CLOSURE_DOCUMENT_MAX_BYTES).toBe(10_485_760);
  });

  it('422 en closure: PDF inválido', () => {
    expect(getApiErrorMessage(enrichedError(422), 'closure')).toBe(
      'El archivo no es un PDF válido o no pudo leerse.',
    );
  });

  it('503 en closure: storage no disponible (distinto del 503 genérico)', () => {
    const closure = getApiErrorMessage(enrichedError(503), 'closure');
    const generic = getApiErrorMessage(enrichedError(503), 'task');
    expect(closure).toContain('documentos de cierre');
    expect(generic).not.toContain('documentos de cierre');
    expect(isClosureNoConfigurado(enrichedError(503))).toBe(true);
  });

  it('403 devuelve mensajes diferenciados por scope nuevo', () => {
    const hours = getApiErrorMessage(enrichedError(403), 'hours');
    const closure = getApiErrorMessage(enrichedError(403), 'closure');
    const leadership = getApiErrorMessage(enrichedError(403), 'leadership');
    const admin = getApiErrorMessage(enrichedError(403), 'admin');
    const task = getApiErrorMessage(enrichedError(403), 'task');
    expect(new Set([hours, closure, leadership, admin, task]).size).toBe(5);
    expect(leadership).toContain('liderazgo');
  });

  it('400 en scopes S7 muestra el mensaje funcional del backend', () => {
    expect(
      getApiErrorMessage(enrichedError(400, 'se requiere justificacionExceso'), 'hours'),
    ).toBe('se requiere justificacionExceso');
    expect(getApiErrorMessage(enrichedError(400, 'x'), 'task')).toBe(
      'Revisa los datos ingresados y las relaciones seleccionadas.',
    );
  });

  it('409 REGISTRO_YA_REVOCADO se reconoce por code o por mensaje', () => {
    expect(isRegistroYaRevocado(enrichedError(409, 'x', { code: 'REGISTRO_YA_REVOCADO' }))).toBe(true);
    expect(isRegistroYaRevocado(enrichedError(409, 'El registro de tiempo ya estaba revocado'))).toBe(true);
    expect(isRegistroYaRevocado(enrichedError(409, 'Sprint cerrado'))).toBe(false);
    expect(isRegistroYaRevocado(enrichedError(404, 'x', { code: 'REGISTRO_YA_REVOCADO' }))).toBe(false);
    expect(getApiErrorMessage(enrichedError(409, 'x', { code: 'REGISTRO_YA_REVOCADO' }), 'hours')).toContain(
      'ya había sido revocado',
    );
  });

  it('409 PROYECTO_OCUPADO en closure explica que es reintentable', () => {
    const error = enrichedError(409, 'x', { code: 'PROYECTO_OCUPADO' });
    expect(isProyectoOcupado(error)).toBe(true);
    expect(getApiErrorMessage(error, 'closure')).toContain('Actualiza');
  });

  it('getApiErrorCode lee el code directo o dentro de details', () => {
    expect(getApiErrorCode(enrichedError(409, 'x', { code: 'A' }))).toBe('A');
    expect(getApiErrorCode(enrichedError(409, 'x', { details: { code: 'B' } }))).toBe('B');
    expect(getApiErrorCode(enrichedError(409, 'x'))).toBeUndefined();
    expect(getApiErrorCode(null)).toBeUndefined();
  });

  it('los scopes previos conservan su comportamiento', () => {
    expect(getApiErrorMessage(enrichedError(409), 'label')).toBe('Ya existe una etiqueta con ese nombre.');
    expect(getApiErrorMessage(enrichedError(404), 'task')).toContain('ya no está disponible');
  });
});
