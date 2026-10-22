'use client';

import Image from 'next/image';
import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';
import logoUvg from '@/public/Logo UVG-01.png';
import { prefiereMovimientoReducido } from './movimiento-reducido';

const CENTRO = 200;
const RADIO = 140;
const MERIDIANOS = [121, 70, 24];
const PARALELOS = [-50, -25, 0, 25, 50];
const SATELITES = [
  { cx: 15, cy: 200, r: 5 },
  { cx: 290, cy: 241, r: 4 },
  { cx: 168, cy: 153, r: 3.5 },
];

function paralelo(latitud: number) {
  const radianes = (latitud * Math.PI) / 180;
  const rx = RADIO * Math.cos(radianes);
  return { cy: CENTRO - RADIO * Math.sin(radianes), rx, ry: rx * 0.22 };
}

export const ETIQUETA_ILUSTRACION_UVG =
  'Ilustración de una esfera en malla con el logo de la Universidad del Valle de Guatemala';

export function IlustracionUvg({ className }: { className?: string }) {
  const raiz = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || prefiereMovimientoReducido()) return;
    const ctx = gsap.context(() => {
      gsap.to('[data-ilustracion-esfera]', { rotation: 360, svgOrigin: `${CENTRO} ${CENTRO}`, duration: 60, ease: 'none', repeat: -1 });
      gsap.to('[data-ilustracion-orbita]', { rotation: -360, svgOrigin: `${CENTRO} ${CENTRO}`, duration: 40, ease: 'none', repeat: -1 });
      gsap.to('[data-ilustracion-flotante]', { y: -12, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }, nodo);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={raiz}
      role="img"
      aria-label={ETIQUETA_ILUSTRACION_UVG}
      data-testid="ilustracion-uvg"
      className={cn('relative mx-auto aspect-square w-full max-w-md', className)}
    >
      <div data-ilustracion-flotante className="absolute inset-0">
        <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className="h-full w-full text-primary">
          <circle cx={CENTRO} cy={CENTRO} r={RADIO + 28} className="fill-primary/5" />
          <g transform={`rotate(-18 ${CENTRO} ${CENTRO})`}>
            <g data-ilustracion-esfera>
              <circle cx={CENTRO} cy={CENTRO} r={RADIO} stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} />
              {MERIDIANOS.map((rx) => (
                <ellipse
                  key={`meridiano-${rx}`}
                  cx={CENTRO}
                  cy={CENTRO}
                  rx={rx}
                  ry={RADIO}
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              ))}
              {PARALELOS.map((latitud) => {
                const { cy, rx, ry } = paralelo(latitud);
                return (
                  <ellipse
                    key={`paralelo-${latitud}`}
                    cx={CENTRO}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    stroke="currentColor"
                    strokeOpacity={latitud === 0 ? 0.55 : 0.3}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
            <g data-ilustracion-orbita>
              <ellipse
                cx={CENTRO}
                cy={CENTRO}
                rx={RADIO + 45}
                ry={48}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeWidth={1}
                strokeDasharray="4 8"
              />
              {SATELITES.map((satelite) => (
                <circle key={`satelite-${satelite.cx}`} {...satelite} className="fill-primary" />
              ))}
            </g>
          </g>
        </svg>
        <div className="absolute inset-[15%]">
          <Image
            src={logoUvg}
            alt=""
            fill
            sizes="(min-width: 1024px) 20rem, 60vw"
            className="object-contain drop-shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}
