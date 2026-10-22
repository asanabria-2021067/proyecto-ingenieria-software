'use client';

import Image from 'next/image';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import logoUvg from '@/public/Logo UVG-01.png';
import { useAnimacionError } from './use-animacion-error';

export interface PaginaErrorProps {
  codigo: string;
  titulo: string;
  descripcion: string;
  referencia?: string;
  variante?: 'pantalla' | 'seccion';
  children: ReactNode;
}

export function PaginaError({ codigo, titulo, descripcion, referencia, variante = 'pantalla', children }: PaginaErrorProps) {
  const raiz = useRef<HTMLElement>(null);
  useAnimacionError(raiz);
  const Contenedor = variante === 'pantalla' ? 'main' : 'section';

  return (
    <Contenedor
      ref={raiz}
      aria-labelledby="pagina-error-titulo"
      className={cn(
        'flex w-full items-center justify-center px-4 py-12 font-body text-text-primary antialiased sm:px-6',
        variante === 'pantalla' ? 'min-h-screen bg-page' : 'min-h-[60vh]',
      )}
    >
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div data-error-entrada className="relative mb-6 h-24 w-24 sm:h-28 sm:w-28">
          <Image src={logoUvg} alt="Universidad del Valle de Guatemala" fill sizes="7rem" className="object-contain" />
        </div>
        <div data-error-entrada className="relative flex h-40 w-40 items-center justify-center sm:h-52 sm:w-52">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/10" />
          <p
            data-error-codigo
            aria-hidden="true"
            className="relative font-headline text-8xl font-extrabold leading-none tracking-tight text-primary sm:text-9xl"
          >
            {codigo}
          </p>
        </div>
        <h1
          id="pagina-error-titulo"
          data-error-entrada
          className="mt-8 font-headline text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl"
        >
          {titulo}
        </h1>
        <p data-error-entrada className="mt-3 max-w-md text-base text-text-secondary">
          {descripcion}
        </p>
        {referencia && (
          <p data-error-entrada className="mt-3 text-xs text-text-secondary">
            Código de referencia: <code className="rounded-control bg-surface-container px-1.5 py-0.5 font-mono">{referencia}</code>
          </p>
        )}
        <div data-error-entrada className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          {children}
        </div>
      </div>
    </Contenedor>
  );
}

export const CLASE_BOTON_PRINCIPAL =
  'h-11 rounded-xl bg-primary px-6 font-headline font-bold text-on-primary shadow-card hover:bg-primary/90';
export const CLASE_BOTON_SECUNDARIO =
  'h-11 rounded-xl border-outline-variant bg-card px-6 font-headline font-bold text-text-primary hover:bg-surface-container';
