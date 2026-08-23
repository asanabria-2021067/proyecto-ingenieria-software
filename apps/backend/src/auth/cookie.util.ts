import { Response } from 'express';

export const ACCESS_TOKEN_TTL = '1h';
export const REFRESH_TOKEN_TTL = '30d';
export const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Deploy actual sirve por HTTP plano (sin TLS); una cookie `secure` en ese
    // caso el navegador la descarta silenciosamente y la sesión nunca prende.
    // Activar con COOKIE_SECURE=true cuando el despliegue tenga HTTPS.
    secure: process.env.COOKIE_SECURE === 'true',
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
