import { afterEach, describe, expect, it } from 'vitest';
import { getRequiredJwtSecret } from '../src/config/jwt-secret';

describe('getRequiredJwtSecret (T-210)', () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  it('lanza si JWT_SECRET no está definida, sin caer a un valor por defecto', () => {
    delete process.env.JWT_SECRET;
    expect(() => getRequiredJwtSecret()).toThrow('JWT_SECRET environment variable is required');
  });

  it('lanza si JWT_SECRET está vacía', () => {
    process.env.JWT_SECRET = '';
    expect(() => getRequiredJwtSecret()).toThrow('JWT_SECRET environment variable is required');
  });

  it('devuelve el valor configurado cuando está presente', () => {
    process.env.JWT_SECRET = 'un-secreto-real';
    expect(getRequiredJwtSecret()).toBe('un-secreto-real');
  });
});
