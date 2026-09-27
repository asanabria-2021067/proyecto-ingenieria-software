import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * HU-154 (T-216): rejilla de 12 columnas del detalle de proyecto con columna
 * lateral de apoyo (8/4).
 *
 * A diferencia de `.layout-grid` (global.css), que cambia de columnas según
 * el ancho de la ventana, esta rejilla lo hace según el ancho del contenedor
 * `@container/project` que declaran los layouts del proyecto. En esta vista
 * conviven la sidebar global y la del proyecto: a 1024 px de ventana el
 * contenido real mide unos 540 px y un 8/4 dejaría la columna lateral en
 * ~150 px. Con la consulta por contenedor el 8/4 aparece solo cuando el
 * contenido tiene al menos 56rem, y por debajo todo va en una columna.
 *
 * Mismos tokens que el sistema de diseño: `max-w-content`, `gap-grid` y el
 * espaciado de página de las vistas ya migradas.
 */
export function ProjectContentGrid({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="project-content-grid"
      className={cn(
        'mx-auto grid w-full max-w-content grid-cols-1 gap-grid px-stack py-section lg:px-section @4xl/project:grid-cols-12',
        className,
      )}
      {...props}
    />
  );
}

/** Ocupa las 12 columnas: encabezado del proyecto y estado del proyecto. */
export function ProjectGridFull({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="project-grid-full"
      className={cn('flex min-w-0 flex-col gap-grid @4xl/project:col-span-12', className)}
      {...props}
    />
  );
}

/** Columna principal (8/12). */
export function ProjectGridMain({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="project-grid-main"
      className={cn('flex min-w-0 flex-col gap-grid @4xl/project:col-span-8', className)}
      {...props}
    />
  );
}

/** Columna lateral de apoyo (4/12). */
export function ProjectGridAside({ className, ...props }: ComponentProps<'aside'>) {
  return (
    <aside
      data-slot="project-grid-aside"
      className={cn('flex min-w-0 flex-col gap-grid @4xl/project:col-span-4', className)}
      {...props}
    />
  );
}
