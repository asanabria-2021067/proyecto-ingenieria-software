/**
 * G06 (OWASP25-C039): Content Security Policy del frontend, construida a partir
 * del inventario de orígenes REALES de la app (ver la auditoría de G06-C04).
 * Nada de comodines: cada origen externo tiene un consumidor concreto.
 *
 * - script-src 'unsafe-inline': Next inyecta scripts inline de hidratación y
 *   app/layout.tsx incluye el polyfill de crypto.randomUUID inline. Quitarlo
 *   exige nonces por petición (render dinámico de todas las páginas), un
 *   cambio de arquitectura fuera de G06.
 * - style-src 'unsafe-inline': atributos style (framer-motion/gsap) y <style>
 *   inyectados (components/ui/chart.tsx, cinematic-landing-hero.tsx).
 * - img-src: data: (SVG inline del hero), blob: (vista previa de la foto antes
 *   de subirla) y res.cloudinary.com (fotos y logos servidos sin next/image).
 * - connect-src: la API (NEXT_PUBLIC_API_URL, horneada en el build) y su
 *   variante ws/wss para Socket.IO (hooks/use-chat.ts y
 *   useRealtimeNotifications eligen ws o wss según la página), más
 *   api.cloudinary.com (lib/cloudinary.ts sube archivos desde el navegador).
 * - frame-src blob:: el visor de documentos de cierre embebe un objectURL.
 */

export const CLOUDINARY_DELIVERY_ORIGIN = 'https://res.cloudinary.com';
export const CLOUDINARY_UPLOAD_ORIGIN = 'https://api.cloudinary.com';

/** Origen de la API y sus variantes ws/wss; vacío si la API es del mismo origen. */
export function apiConnectSources(apiUrl: string | undefined): string[] {
  if (!apiUrl) {
    return [];
  }
  const { protocol, host, origin } = new URL(apiUrl);
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL debe ser http(s)');
  }
  return [origin, `ws://${host}`, `wss://${host}`];
}

export function cspDirectives(apiUrl: string | undefined): Array<[string, string[]]> {
  return [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', CLOUDINARY_DELIVERY_ORIGIN]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...apiConnectSources(apiUrl), CLOUDINARY_UPLOAD_ORIGIN]],
    ['frame-src', ['blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
}

export function buildContentSecurityPolicy(apiUrl: string | undefined): string {
  return cspDirectives(apiUrl)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}
