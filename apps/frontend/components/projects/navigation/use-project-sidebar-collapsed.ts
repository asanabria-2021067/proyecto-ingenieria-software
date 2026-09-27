'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * HU-154 (T-215): preferencia expandida/colapsada de la sidebar contextual
 * del proyecto. Es ergonomía del usuario en ese navegador, no un dato del
 * proyecto: vive solo en localStorage (nunca en cookie ni en la base de
 * datos) y es la misma para todos los proyectos.
 *
 * `useSyncExternalStore` con snapshot de servidor «expandida» evita el
 * mismatch de hidratación: el HTML del servidor siempre sale expandido y,
 * si había una preferencia colapsada, se aplica justo después de hidratar.
 */
export const PROJECT_SIDEBAR_STORAGE_KEY = 'uvg-collab-project-sidebar';

type PreferenciaSidebar = 'collapsed' | 'expanded';

// Aviso para las instancias de esta misma pestaña: el evento `storage` del
// navegador solo llega a las OTRAS pestañas.
const CAMBIO_LOCAL = 'uvg-collab-project-sidebar-change';

// Si localStorage no se puede usar (modo privado estricto, cuota llena,
// política del navegador), la preferencia sigue funcionando en memoria
// durante la sesión en vez de romper la sidebar.
let almacenamientoInutilizable = false;
let preferenciaEnMemoria: PreferenciaSidebar = 'expanded';

function leerColapsada(): boolean {
  if (almacenamientoInutilizable) return preferenciaEnMemoria === 'collapsed';
  try {
    return window.localStorage.getItem(PROJECT_SIDEBAR_STORAGE_KEY) === 'collapsed';
  } catch {
    return preferenciaEnMemoria === 'collapsed';
  }
}

function leerColapsadaEnServidor(): boolean {
  return false;
}

function suscribir(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // `key === null` significa que otra pestaña vació todo el storage.
    if (event.key === null || event.key === PROJECT_SIDEBAR_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CAMBIO_LOCAL, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CAMBIO_LOCAL, onChange);
  };
}

function guardar(preferencia: PreferenciaSidebar) {
  preferenciaEnMemoria = preferencia;
  try {
    window.localStorage.setItem(PROJECT_SIDEBAR_STORAGE_KEY, preferencia);
  } catch {
    almacenamientoInutilizable = true;
  }
  window.dispatchEvent(new Event(CAMBIO_LOCAL));
}

export function useProjectSidebarCollapsed() {
  const collapsed = useSyncExternalStore(suscribir, leerColapsada, leerColapsadaEnServidor);

  const setCollapsed = useCallback((next: boolean) => {
    guardar(next ? 'collapsed' : 'expanded');
  }, []);

  const toggleCollapsed = useCallback(() => {
    guardar(leerColapsada() ? 'expanded' : 'collapsed');
  }, []);

  return { collapsed, setCollapsed, toggleCollapsed };
}
