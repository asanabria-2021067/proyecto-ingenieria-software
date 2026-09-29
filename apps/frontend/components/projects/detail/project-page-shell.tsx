import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Geometría única de las vistas internas de un proyecto: el ancho de
 * contenido del sistema de diseño (`max-w-content`), centrado, con el gutter
 * de las vistas migradas (HU-154) y el mismo aire vertical. La comparten
 * `ProjectPageShell` y `ProjectContentGrid`, así que todas las páginas del
 * proyecto empiezan en la misma guía vertical.
 */
export const PROJECT_PAGE_CLASS = 'mx-auto w-full max-w-content px-stack py-section lg:px-section';

/** Contenedor de página de las vistas internas del proyecto. Cada página solo pone su contenido. */
export function ProjectPageShell({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="project-page-shell" className={cn(PROJECT_PAGE_CLASS, className)} {...props} />;
}

export interface ProjectBackLinkProps {
  href: string;
  label: string;
}

/**
 * Navegación de retorno («← Volver al proyecto», «← Volver a Sprints»…). El
 * encabezado la incluye; suelta (`className="mb-card"`) acompaña a los avisos
 * de acceso, que no muestran título.
 */
export function ProjectBackLink({ href, label, className }: ProjectBackLinkProps & { className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-primary',
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

interface ProjectPageHeaderProps {
  /** Vuelta a la vista padre; se omite cuando la página no la necesita. */
  back?: ProjectBackLinkProps;
  title: ReactNode;
  description?: ReactNode;
  /** Acciones globales de la página: a la derecha cuando hay ancho, debajo si no. */
  actions?: ReactNode;
  /** Datos breves bajo la descripción (p. ej. «Líder: …»). */
  children?: ReactNode;
  className?: string;
}

/**
 * Encabezado de página de las vistas internas del proyecto. Va directo sobre
 * el fondo: el título y la descripción dicen dónde está el usuario; las
 * tarjetas quedan para el contenido. Mide el contenedor `@container/project`
 * (no la ventana): con las dos sidebars abiertas, las acciones solo pasan a
 * la derecha cuando el contenido mide al menos 48rem.
 */
export function ProjectPageHeader({
  back,
  title,
  description,
  actions,
  children,
  className,
}: ProjectPageHeaderProps) {
  return (
    <header data-slot="project-page-header" className={cn('mb-section flex flex-col gap-card', className)}>
      {back && <ProjectBackLink {...back} />}
      <div className="flex flex-col gap-stack @3xl/project:flex-row @3xl/project:items-start @3xl/project:justify-between">
        <div className="min-w-0">
          {/* Solo el título: sin icono de sección a su lado. */}
          <h1 className="type-display min-w-0 text-text-primary">{title}</h1>
          {description && <p className="type-body mt-micro max-w-prose text-text-secondary">{description}</p>}
          {children}
        </div>
        {actions && (
          <div
            data-slot="project-page-actions"
            className="flex shrink-0 flex-wrap items-start gap-tight @3xl/project:justify-end"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
