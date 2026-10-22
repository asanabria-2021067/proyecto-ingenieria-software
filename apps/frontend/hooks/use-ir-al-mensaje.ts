'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { ChatMensaje } from '@/lib/types/chat';

const MAX_PAGINAS = 20;
const RESALTADO_MS = 1800;

interface Opciones {
  listRef: RefObject<HTMLElement | null>;
  messages: ChatMensaje[];
  /** Carga la página anterior al mensaje más viejo; devuelve lo cargado ([] si no hay más). */
  cargarAnteriores: () => Promise<ChatMensaje[]>;
  onNoDisponible: () => void;
}

/**
 * Salto al mensaje citado: si aún no está en la lista paginada, carga páginas
 * anteriores hasta encontrarlo (o avisa). El scroll espera a que el mensaje
 * exista en el DOM y respeta prefers-reduced-motion.
 */
export function useIrAlMensaje({ listRef, messages, cargarAnteriores, onNoDisponible }: Opciones) {
  const pendienteRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alcanzar = useCallback(
    (id: number) => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-mensaje-id="${id}"]`);
      if (!el) return false;
      const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reducido ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
      // Atributo en vez de estado: el resaltado es efímero y no justifica otro render.
      el.dataset.resaltado = 'true';
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => delete el.dataset.resaltado, RESALTADO_MS);
      return true;
    },
    [listRef],
  );

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Tras cargar páginas anteriores el mensaje aparece en el DOM en un render posterior.
  useEffect(() => {
    if (pendienteRef.current !== null && alcanzar(pendienteRef.current)) pendienteRef.current = null;
  }, [messages, alcanzar]);

  const irAlMensaje = useCallback(
    async (id: number) => {
      if (alcanzar(id)) return;
      pendienteRef.current = id;
      for (let i = 0; i < MAX_PAGINAS; i++) {
        const previos = await cargarAnteriores();
        if (previos.some((m) => m.idMensaje === id)) return;
        if (previos.length === 0) break;
      }
      pendienteRef.current = null;
      onNoDisponible();
    },
    [alcanzar, cargarAnteriores, onNoDisponible],
  );

  return { irAlMensaje };
}
