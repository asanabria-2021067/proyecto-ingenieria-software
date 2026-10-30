import type { NextFunction, Request, Response } from 'express';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Sin Origin se acepta (clientes sin navegador); 'null' y otros orígenes se rechazan.
export function isAllowedOrigin(origin: string | undefined, allowed: string): boolean {
  if (origin === undefined) return true;
  if (origin === 'null') return false;
  try {
    return new URL(origin).origin === new URL(allowed).origin;
  } catch {
    return false;
  }
}

// Defensa CSRF: valida Origin / Sec-Fetch-Site y Content-Type en métodos no seguros.
export function originGuard(allowed: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    const crossOrigin =
      origin !== undefined
        ? !isAllowedOrigin(origin, allowed)
        : fetchSite === 'cross-site' || fetchSite === 'same-site';
    if (crossOrigin) {
      return res.status(403).json({ statusCode: 403, message: 'Origen no permitido' });
    }

    // Solo JSON o multipart cuando hay cuerpo (evita formularios simples cross-site).
    const hasBody =
      Number(req.headers['content-length'] ?? 0) > 0 ||
      req.headers['transfer-encoding'] !== undefined;
    if (hasBody) {
      const type = (req.headers['content-type'] ?? '').toLowerCase();
      if (!type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
        return res.status(415).json({ statusCode: 415, message: 'Content-Type no soportado' });
      }
    }
    next();
  };
}
