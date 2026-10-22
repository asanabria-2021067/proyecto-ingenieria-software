'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { prefiereMovimientoReducido } from './movimiento-reducido';

export function useAnimacionError(raiz: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || prefiereMovimientoReducido()) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-error-entrada]', {
        autoAlpha: 0,
        y: 20,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.08,
      });
      gsap.from('[data-error-codigo]', {
        scale: 0.9,
        duration: 0.8,
        ease: 'back.out(1.6)',
      });
    }, nodo);
    return () => ctx.revert();
  }, [raiz]);
}
