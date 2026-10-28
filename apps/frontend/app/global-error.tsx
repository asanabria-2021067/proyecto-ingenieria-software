'use client';

import './global.css';
import { useLayoutEffect } from 'react';
import { Inter, Manrope } from 'next/font/google';
import { ErrorInesperado } from '@/components/errores/error-inesperado';
import { aplicarTemaGuardado } from '@/components/errores/tema-guardado';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLayoutEffect(() => {
    aplicarTemaGuardado();
  }, []);

  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${manrope.variable} bg-page font-body`}>
        <ErrorInesperado error={error} reset={reset} inicio="/" />
      </body>
    </html>
  );
}
