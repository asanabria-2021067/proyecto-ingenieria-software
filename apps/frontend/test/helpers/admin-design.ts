import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Medición de contratos visuales de las vistas administrativas (T-320), compartida por sus suites. */

export const RAIZ = join(__dirname, '../..');
export const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

/** Todas las vistas servidas bajo el shell administrativo (una entrada por ruta real). */
export const VISTAS_ADMIN: Record<string, string> = {
  '/dashboard/admin': 'app/dashboard/admin/page.tsx',
  '/dashboard/admin/usuarios': 'app/dashboard/admin/usuarios/page.tsx',
  '/dashboard/admin/solicitudes-recuperacion': 'app/dashboard/admin/solicitudes-recuperacion/page.tsx',
  '/dashboard/admin/cuentas-pendientes': 'app/dashboard/admin/cuentas-pendientes/page.tsx',
  '/dashboard/admin/metricas': 'app/dashboard/admin/metricas/page.tsx',
  '/dashboard/admin/seguridad': 'app/dashboard/admin/seguridad/page.tsx',
  '/dashboard/admin/anuncios': 'app/dashboard/admin/anuncios/page.tsx',
  '/dashboard/admin/botones': 'app/dashboard/admin/botones/page.tsx',
  '/dashboard/admin/apelaciones': 'app/dashboard/admin/apelaciones/appeals-inbox-client.tsx',
  '/dashboard/admin/apelaciones/[apelacionId]': 'app/dashboard/admin/apelaciones/[apelacionId]/appeal-review-client.tsx',
  '/dashboard/admin/proyectos': 'app/dashboard/admin/proyectos/admin-projects-client.tsx',
  '/dashboard/admin/proyectos/[id]': 'app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx',
  '/dashboard/admin/proyectos/[id]/cierre': 'app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx',
  '/dashboard/admin/sprints': 'app/dashboard/admin/sprints/admin-sprints-client.tsx',
  '/dashboard/projects/admin/reviews': 'app/dashboard/projects/admin/reviews/page.tsx',
};

export interface Medida {
  /** Tamaños de letra literales (`text-[13px]`) en vez de `type-*`. */
  px: number;
  /** Radios literales de Tailwind (`rounded-xl`) en vez de `rounded-control|card|tag`. */
  radio: number;
  /** Colores hexadecimales escritos en la vista. */
  hex: number;
  /** `<button>` nativos con estilo propio en vez del componente `Button`. */
  boton: number;
  /** El titular de la página usa `type-display`. */
  titular: boolean;
}

export function medir(fuente: string): Medida {
  const contar = (patron: RegExp) => fuente.match(patron)?.length ?? 0;
  // El titular puede llevar la clase escrita o la primitiva compartida `ADMIN_PAGE_TITLE` (= type-display).
  const h1 = fuente.match(/<h1[^>]*className=(?:"([^"]*)"|\{(ADMIN_PAGE_TITLE)\})/);
  return {
    px: contar(/\btext-\[[0-9.]+px\]/g),
    radio: contar(/\brounded-(?:md|lg|xl|2xl|3xl)\b/g),
    hex: contar(/#[0-9a-fA-F]{6}\b/g),
    boton: contar(/<button\b/g),
    titular: h1 !== null && (h1[2] === 'ADMIN_PAGE_TITLE' || (h1[1] ?? '').split(/\s+/).includes('type-display')),
  };
}
