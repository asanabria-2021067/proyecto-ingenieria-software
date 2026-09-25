import { NextRequest, NextResponse } from 'next/server';
import { buildLoginUrl } from '@/lib/api/session';

// Mismo criterio de sesión que el resto del frontend (apiFetch, useCurrentUser):
// la cookie httpOnly access_token, nunca localStorage/JS-readable.
const AUTH_ROUTES = ['/login', '/registro'];
const PROTECTED_PREFIX = '/dashboard';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('access_token')?.value);
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isProtectedRoute = pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`);

  if (!hasSession && isProtectedRoute) {
    // T-221: conservar a dónde iba el usuario para volver tras el login.
    const next = `${pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(buildLoginUrl(next), request.url));
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Excluye estáticos, _next y las rutas de API (el proxy /api/[...path] ya
  // reenvía cookies tal cual; el middleware solo gatea navegación de páginas).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
