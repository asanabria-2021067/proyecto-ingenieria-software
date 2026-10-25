'use client';

import { useEffect, useState } from 'react';
import { crearPreferenciaColapsada } from '@/components/dashboard/use-dashboard-sidebar-collapsed';

/**
 * Sprint 10 — preferencias visuales de la bandeja de notificaciones. Ergonomía
 * del navegador, no datos: solo localStorage, con el mismo patrón que las
 * sidebars global y del proyecto (snapshot de servidor «expandida» = sin
 * mismatch de hidratación).
 */
export const INBOX_FOLDERS_STORAGE_KEY = 'uvg-collab-inbox-folders';

/** react-resizable-panels guarda el reparto bandeja/visor bajo esta clave. */
export const INBOX_PANELS_AUTOSAVE_ID = 'uvg-collab-inbox-panels';

/** Sidebar secundaria (carpetas) expandida o contraída. Independiente de la sidebar global. */
export const useInboxFoldersCollapsed = crearPreferenciaColapsada(INBOX_FOLDERS_STORAGE_KEY);

/**
 * `true` cuando la media query coincide. Empieza en `false` en servidor y en
 * la primera pintura (sin mismatch) y se corrige tras hidratar.
 */
export function useMediaQuery(query: string): boolean {
  const [coincide, setCoincide] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setCoincide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return coincide;
}

/** Por debajo de md (768 px): un solo panel a la vez (lista o detalle). */
export const MOBILE_QUERY = '(max-width: 767px)';
/** Entre md y xl: la sidebar de carpetas solo cabe como rail de iconos. */
export const RAIL_ONLY_QUERY = '(max-width: 1279px)';
