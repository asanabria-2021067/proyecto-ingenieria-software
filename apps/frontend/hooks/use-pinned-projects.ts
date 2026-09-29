'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Anclado de proyectos en el sidebar: preferencia puramente de UI, sin tabla
 * en BD. Vive en localStorage con clave por usuario (`proyectos-anclados:{id}`)
 * para no mezclarse entre cuentas en el mismo navegador. Máximo 5 anclados.
 */
export interface PinnedProject {
  idProyecto: number;
  tituloProyecto: string;
}

const STORAGE_PREFIX = 'proyectos-anclados';
export const MAX_PINNED_PROJECTS = 5;
const CAMBIO_LOCAL = 'uvg-collab-pinned-projects-change';
const EMPTY: PinnedProject[] = [];

function storageKey(idUsuario: number): string {
  return `${STORAGE_PREFIX}:${idUsuario}`;
}

function parse(raw: string | null): PinnedProject[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

// Cache por clave: `useSyncExternalStore` exige que getSnapshot devuelva la
// misma referencia si el contenido no cambió, o entra en loop de renders.
let cache: { key: string; raw: string | null; value: PinnedProject[] } | null = null;

function leer(idUsuario: number | null): PinnedProject[] {
  if (idUsuario == null) return EMPTY;
  const key = storageKey(idUsuario);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (cache && cache.key === key && cache.raw === raw) return cache.value;
  const value = parse(raw);
  cache = { key, raw, value };
  return value;
}

function guardar(idUsuario: number, proyectos: PinnedProject[]) {
  try {
    window.localStorage.setItem(storageKey(idUsuario), JSON.stringify(proyectos));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): el anclado no persiste.
  }
  window.dispatchEvent(new Event(CAMBIO_LOCAL));
}

function suscribir(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CAMBIO_LOCAL, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CAMBIO_LOCAL, onChange);
  };
}

function snapshotServidor(): PinnedProject[] {
  return EMPTY;
}

export function usePinnedProjects(idUsuario: number | null | undefined) {
  const id = idUsuario ?? null;
  const pinned = useSyncExternalStore(suscribir, () => leer(id), snapshotServidor);

  const isPinned = useCallback((idProyecto: number) => pinned.some((p) => p.idProyecto === idProyecto), [pinned]);

  const togglePin = useCallback(
    (proyecto: PinnedProject) => {
      if (id == null) return;
      const actuales = leer(id);
      if (actuales.some((p) => p.idProyecto === proyecto.idProyecto)) {
        guardar(id, actuales.filter((p) => p.idProyecto !== proyecto.idProyecto));
        return;
      }
      if (actuales.length >= MAX_PINNED_PROJECTS) return;
      guardar(id, [...actuales, proyecto]);
    },
    [id],
  );

  return { pinned, isPinned, togglePin, maxAlcanzado: pinned.length >= MAX_PINNED_PROJECTS };
}
