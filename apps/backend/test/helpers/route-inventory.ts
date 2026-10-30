import 'reflect-metadata';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_METADATA_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * Inventario de rutas HTTP leido de la metadata de los decoradores de todos
 * los `*.controller.ts` de src, sin levantar la app (el transform de Vitest no
 * emite `design:paramtypes`, asi que el arbol de DI no se puede construir).
 */
export interface Ruta {
  /** `GET /api/proyectos/:id` */
  id: string;
  metodo: string;
  /** Path sin prefijo `api` ni barras sobrantes. */
  path: string;
  controller: string;
  guards: unknown[];
  roles: string[];
  adminPath: boolean;
}

// Unica lista de rutas que pueden responder sin token. Agregar una aqui es una
// decision de seguridad explicita: revisarla en el PR.
export const RUTAS_PUBLICAS = new Set([
  'GET /api',
  'GET /api/carreras',
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/contacto',
]);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

const guardsDe = (target: object): unknown[] => Reflect.getMetadata(GUARDS_METADATA, target) ?? [];

export async function cargarRutas(): Promise<Ruta[]> {
  const rutas: Ruta[] = [];
  for (const file of controllerFiles(resolve(__dirname, '../../src'))) {
    const mod = await import(file);
    for (const ctrl of Object.values(mod) as Array<new (...a: never[]) => unknown>) {
      if (typeof ctrl !== 'function') continue;
      const base = Reflect.getMetadata(PATH_METADATA, ctrl);
      if (base === undefined) continue; // no es @Controller
      for (const nombre of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = ctrl.prototype[nombre];
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler);
        if (metodo === undefined) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const path = [base, sub].join('/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        rutas.push({
          id: `${RequestMethod[metodo]} /api${path && '/' + path}`,
          metodo: RequestMethod[metodo],
          path,
          controller: `${ctrl.name}.${nombre}`,
          guards: [...guardsDe(ctrl), ...guardsDe(handler)],
          roles: [
            ...(Reflect.getMetadata(ROLES_METADATA_KEY, handler) ?? Reflect.getMetadata(ROLES_METADATA_KEY, ctrl) ?? []),
          ],
          adminPath: /(^|\/)admin/.test(path) || /Admin/.test(ctrl.name),
        });
      }
    }
  }
  return rutas;
}
