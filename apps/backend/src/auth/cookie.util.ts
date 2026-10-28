import { Response } from 'express';
import { parseCookieSecure } from '../config/environment.validation';

export const ACCESS_TOKEN_TTL = '1h';
export const REFRESH_TOKEN_TTL = '30d';
export const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // En producción `secure` es el valor por defecto (COOKIE_SECURE=false lo
    // desactiva): una cookie `secure` sobre HTTP plano la descarta el navegador
    // y la sesión nunca prende, así que todo el tráfico debe llegar por HTTPS.
    // G06: mismo parser estricto que el validador del arranque.
    secure: parseCookieSecure(process.env.COOKIE_SECURE?.trim(), process.env.NODE_ENV?.trim()),
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}
