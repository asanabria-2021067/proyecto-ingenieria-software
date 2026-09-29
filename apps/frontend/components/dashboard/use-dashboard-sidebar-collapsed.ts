'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferencia expandida/colapsada del sidebar global del dashboard. Mismo
 * patrón que `use-project-sidebar-collapsed.ts` (sidebar contextual del
 * proyecto): solo localStorage, nunca cookie ni base de datos.
 */
export const DASHBOARD_SIDEBAR_STORAGE_KEY = 'uvg-collab-dashboard-sidebar';

const CAMBIO_LOCAL = 'uvg-collab-dashboard-sidebar-change';

let almacenamientoInutilizable = false;
let preferenciaEnMemoria: 'collapsed' | 'expanded' = 'expanded';

function leerColapsada(): boolean {
  if (almacenamientoInutilizable) return preferenciaEnMemoria === 'collapsed';
  try {
    return window.localStorage.getItem(DASHBOARD_SIDEBAR_STORAGE_KEY) === 'collapsed';
  } catch {
    return preferenciaEnMemoria === 'collapsed';
  }
}

function leerColapsadaEnServidor(): boolean {
  return false;
}

function suscribir(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DASHBOARD_SIDEBAR_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CAMBIO_LOCAL, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CAMBIO_LOCAL, onChange);
  };
}

function guardar(preferencia: 'collapsed' | 'expanded') {
  preferenciaEnMemoria = preferencia;
  try {
    window.localStorage.setItem(DASHBOARD_SIDEBAR_STORAGE_KEY, preferencia);
  } catch {
    almacenamientoInutilizable = true;
  }
  window.dispatchEvent(new Event(CAMBIO_LOCAL));
}

export function useDashboardSidebarCollapsed() {
  const collapsed = useSyncExternalStore(suscribir, leerColapsada, leerColapsadaEnServidor);

  const toggleCollapsed = useCallback(() => {
    guardar(leerColapsada() ? 'expanded' : 'collapsed');
  }, []);

  return { collapsed, toggleCollapsed };
}
