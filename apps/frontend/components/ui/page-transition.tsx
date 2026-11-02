'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/** Tarjetas estándar (`.card-base`, `Card`); las arrastrables (dnd-kit) se saltan. */
const TARJETAS = '.card-base, [data-slot="card"]';

// Carga dura (HTML del servidor ya pintado): animar desde 0 causaría el destello.
let hidratada = false;

const SALIDA = { duration: 0.18, ease: 'easeOut' } as const;

/**
 * MEJ-76: transición de página (aparece y sube unos px) y aparición escalonada
 * de las tarjetas, incluidas las que llegan después con los datos. Todo dura
 * menos de 250 ms y se omite con `prefers-reduced-motion`. Va en
 * `app/dashboard/template.tsx`, que React vuelve a montar en cada navegación.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  const reducir = useReducedMotion();

  // Antes del pintado: evita el destello a opacidad plena. Sin `y` en la raíz: un transform residual
  // volvería `position: fixed` relativo al contenedor.
  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || reducir) return;
    if (!hidratada) {
      hidratada = true;
      return;
    }

    animate(nodo, { opacity: [0, 1] }, SALIDA);

    let lote = 0;
    const revelar = (el: Element) => {
      if (el.hasAttribute('data-revelada') || el.closest('[aria-roledescription]')) return;
      el.setAttribute('data-revelada', '');
      animate(el, { opacity: [0, 1], y: [8, 0] }, { ...SALIDA, duration: 0.16, delay: Math.min(lote++, 3) * 0.025 });
    };
    nodo.querySelectorAll(TARJETAS).forEach(revelar);

    const observador = new MutationObserver((cambios) => {
      lote = 0;
      for (const { addedNodes } of cambios) {
        addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches(TARJETAS)) revelar(n);
          n.querySelectorAll(TARJETAS).forEach(revelar);
        });
      }
    });
    observador.observe(nodo, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [reducir]);

  return (
    <div ref={raiz} className="h-full">
      {children}
    </div>
  );
}
