import type { NextConfig } from 'next';
import { cspResponseHeaders, parseCspMode } from './lib/security/csp';

/**
 * G06 (OWASP25-C039): rutas de páginas y estáticos del frontend. Excluye
 * `/api` y `/api/...` (proxy same-origin hacia el backend, cuyas cabeceras
 * pone Helmet).
 */
const FRONTEND_ROUTES = '/((?!api(?:/|$)).*)';

/**
 * Cabeceras base de seguridad del HTML. `frame-ancestors` va en la CSP
 * aplicada (ver CSP_HEADERS); X-Frame-Options DENY cubre navegadores
 * antiguos. Permissions-Policy apaga capacidades que la app no usa (el
 * portapapeles, que sí usa, queda intacto).
 */
const BASELINE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/**
 * G06 (OWASP25-C039): CSP según CSP_MODE (build-time, default report-only; ver
 * lib/security/csp.ts). Sin endpoint de reportes: en report-only las
 * violaciones se ven en la consola y las captura el E2E.
 */
const CSP_HEADERS = cspResponseHeaders(parseCspMode(process.env.CSP_MODE), process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  output: 'standalone',
  // G06 (OWASP25-C039): sin `X-Powered-By: Next.js` (divulgación del framework).
  poweredByHeader: false,
  async headers() {
    return [{ source: FRONTEND_ROUTES, headers: [...BASELINE_SECURITY_HEADERS, ...CSP_HEADERS] }];
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
