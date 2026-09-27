import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { setAuthCookies, clearAuthCookies } from '../src/auth/cookie.util';

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('cookie.util (T-210)', () => {
  const originalSecure = process.env.COOKIE_SECURE;

  afterEach(() => {
    if (originalSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = originalSecure;
  });

  it('setAuthCookies pone access_token y refresh_token como httpOnly y sameSite=lax', () => {
    delete process.env.COOKIE_SECURE;
    const res = fakeResponse();

    setAuthCookies(res, 'access-jwt', 'refresh-jwt');

    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      'access-jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('secure sigue a COOKIE_SECURE: false por defecto, true solo con COOKIE_SECURE=true', () => {
    delete process.env.COOKIE_SECURE;
    const res1 = fakeResponse();
    setAuthCookies(res1, 'a', 'r');
    expect(res1.cookie).toHaveBeenCalledWith('access_token', 'a', expect.objectContaining({ secure: false }));

    process.env.COOKIE_SECURE = 'true';
    const res2 = fakeResponse();
    setAuthCookies(res2, 'a', 'r');
    expect(res2.cookie).toHaveBeenCalledWith('access_token', 'a', expect.objectContaining({ secure: true }));
  });

  it('clearAuthCookies limpia ambas cookies en path /', () => {
    const res = fakeResponse();

    clearAuthCookies(res);

    expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' });
  });
});
