import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesSection } from '../../components/profile/notification-preferences-section';
import { NOTIFICATION_GROUP_IDS, type NotificationGroupId, type NotificationPreference } from '../../lib/notifications/preference-groups';

/** Datos y montaje compartidos por las suites de preferencias de notificación (T-328). */

/** Valores de `enum TipoNotificacion` del backend del repositorio, en su orden. */
export const TIPOS_BACKEND: string[] = (() => {
  const schema = readFileSync(join(__dirname, '../../../backend/prisma/schema.prisma'), 'utf8');
  const cuerpo = schema.slice(schema.indexOf('enum TipoNotificacion {'));
  return cuerpo
    .slice(cuerpo.indexOf('{') + 1, cuerpo.indexOf('}'))
    .split(/\r?\n/)
    .map((linea) => linea.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
})();

/** Respuesta de GET /notificaciones/preferencias; `inactivos` son los tipos desactivados. */
export const preferencias = (inactivos: string[] = [], tipos: string[] = TIPOS_BACKEND): NotificationPreference[] =>
  tipos.map((tipo) => ({ tipo, activa: !inactivos.includes(tipo) }));

/**
 * Monta la sección con todas las familias abiertas, para que las suites vean cada interruptor.
 * En la vista real empiezan cerradas: pasar `[]` para probar ese estado.
 */
export function renderSeccion(abiertas: readonly NotificationGroupId[] = NOTIFICATION_GROUP_IDS) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(<NotificationPreferencesSection defaultExpanded={abiertas} />, { wrapper }) };
}

/** Promesa que el test resuelve o rechaza a mano. */
export function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

export const fallo = (statusCode?: number) => Object.assign(new Error('falló'), statusCode ? { statusCode } : {});
