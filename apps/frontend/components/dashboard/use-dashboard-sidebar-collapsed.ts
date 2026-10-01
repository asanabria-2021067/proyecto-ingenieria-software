'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferencia expandida/colapsada de las sidebars globales (estudiante y
 * administrador). Mismo patrón que `use-project-sidebar-collapsed.ts`
 * (sidebar contextual del proyecto): solo localStorage, nunca cookie ni base
 * de datos. Cada sidebar guarda su propia preferencia.
 */
export const DASHBOARD_SIDEBAR_STORAGE_KEY = 'uvg-collab-dashboard-sidebar';
export const ADMIN_SIDEBAR_STORAGE_KEY = 'uvg-collab-admin-sidebar';

function crearPreferenciaColapsada(storageKey: string) {
  const cambioLocal = `${storageKey}-change`;
  let almacenamientoInutilizable = false;
  let preferenciaEnMemoria: 'collapsed' | 'expanded' = 'expanded';

  function leerColapsada(): boolean {
    if (almacenamientoInutilizable) return preferenciaEnMemoria === 'collapsed';
    try {
      return window.localStorage.getItem(storageKey) === 'collapsed';
    } catch {
      return preferenciaEnMemoria === 'collapsed';
    }
  }

  function leerColapsadaEnServidor(): boolean {
    return false;
  }

  function suscribir(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === storageKey) onChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(cambioLocal, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(cambioLocal, onChange);
    };
  }

  function guardar(preferencia: 'collapsed' | 'expanded') {
    preferenciaEnMemoria = preferencia;
    try {
      window.localStorage.setItem(storageKey, preferencia);
    } catch {
      almacenamientoInutilizable = true;
    }
    window.dispatchEvent(new Event(cambioLocal));
  }

  return function useSidebarCollapsed() {
    const collapsed = useSyncExternalStore(suscribir, leerColapsada, leerColapsadaEnServidor);

    const toggleCollapsed = useCallback(() => {
      guardar(leerColapsada() ? 'expanded' : 'collapsed');
    }, []);

    return { collapsed, toggleCollapsed };
  };
}

/** Sidebar global del estudiante (DashboardLayout). */
export const useDashboardSidebarCollapsed = crearPreferenciaColapsada(DASHBOARD_SIDEBAR_STORAGE_KEY);

/** Sidebar graphite del administrador (AdminLayout). */
export const useAdminSidebarCollapsed = crearPreferenciaColapsada(ADMIN_SIDEBAR_STORAGE_KEY);
