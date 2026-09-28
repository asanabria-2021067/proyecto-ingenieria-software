import type { NextConfig } from 'next';

/**
 * G06 (OWASP25-C039): rutas de páginas y estáticos del frontend. Excluye
 * `/api` y `/api/...` (proxy same-origin hacia el backend, cuyas cabeceras
 * pone Helmet).
 */
const FRONTEND_ROUTES = '/((?!api(?:/|$)).*)';

/**
 * Cabeceras base de seguridad del HTML. `frame-ancestors` solo se respeta en
 * una CSP que se aplica (en Report-Only el navegador la ignora), por eso va en
 * su propia `Content-Security-Policy`; X-Frame-Options DENY cubre navegadores
 * antiguos. Permissions-Policy apaga capacidades que la app no usa (el
 * portapapeles, que sí usa, queda intacto).
 */
const BASELINE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: FRONTEND_ROUTES, headers: BASELINE_SECURITY_HEADERS }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'user-images.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
