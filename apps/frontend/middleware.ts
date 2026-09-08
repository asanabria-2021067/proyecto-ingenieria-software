import { NextRequest, NextResponse } from 'next/server';

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
    return NextResponse.redirect(new URL('/login', request.url));
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
