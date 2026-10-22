'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { prefiereMovimientoReducido } from './movimiento-reducido';

export function useAnimacionEntrada(raiz: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || prefiereMovimientoReducido()) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-contacto-encabezado] > *', {
        autoAlpha: 0,
        y: 24,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.08,
      });
      gsap.from('[data-contacto-columna]', {
        autoAlpha: 0,
        y: 32,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.15,
        delay: 0.2,
      });
      gsap.from('[data-contacto-tarjeta]', {
        autoAlpha: 0,
        y: 16,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.1,
        delay: 0.45,
      });
    }, nodo);
    return () => ctx.revert();
  }, [raiz]);
}
