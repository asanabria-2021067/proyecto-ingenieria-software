import { describe, expect, it } from 'vitest';
import { debeReintentarCurrentUser } from '@/hooks/use-current-user';

const conStatus = (statusCode: number) => Object.assign(new Error('x'), { statusCode });

describe('debeReintentarCurrentUser', () => {
  it.each([429, 500, 503])('reintenta un %i mientras intentos < 3', (status) => {
    for (const intentos of [0, 1, 2]) expect(debeReintentarCurrentUser(intentos, conStatus(status))).toBe(true);
    expect(debeReintentarCurrentUser(3, conStatus(status))).toBe(false);
  });

  it('reintenta un error de red (sin statusCode) mientras intentos < 3', () => {
    for (const intentos of [0, 1, 2]) expect(debeReintentarCurrentUser(intentos, new TypeError('Failed to fetch'))).toBe(true);
    expect(debeReintentarCurrentUser(3, new TypeError('Failed to fetch'))).toBe(false);
  });

  it.each([400, 401, 403, 404])('nunca reintenta un %i', (status) => {
    for (const intentos of [0, 1, 2, 3]) expect(debeReintentarCurrentUser(intentos, conStatus(status))).toBe(false);
  });
});
