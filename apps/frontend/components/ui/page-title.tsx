import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Título principal de página (`<h1>`) de UVGenius: único componente para todas
 * las pantallas. Tipografía Rubik, animación de entrada (aparece y sube unos
 * px) y subrayado verde lima de la marca; el CSS está en `.page-title` de
 * `app/global.css` y respeta `prefers-reduced-motion`.
 */
export function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return <h1 data-slot="page-title" className={cn('type-display page-title', className)} {...props} />;
}
