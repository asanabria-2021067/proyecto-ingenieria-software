'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProjectNavGroup } from './project-nav-model';

interface ProjectNavListProps {
  groups: ProjectNavGroup[];
  activeHref: string | null;
  /**
   * `full`: grupos con encabezado y etiquetas visibles (sidebar expandida y
   * Sheet móvil). `rail`: solo iconos con tooltip (sidebar colapsada).
   */
  variant: 'full' | 'rail';
  /** Se llama al elegir un destino (el Sheet móvil lo usa para cerrarse). */
  onNavigate?: () => void;
  id?: string;
}

/**
 * Destino activo: un velo del color del texto (más oscuro en claro, más claro
 * en oscuro) con texto semibold. Funciona igual sobre el gris de la sidebar y
 * sobre el blanco del Sheet móvil, sin acentos de color.
 */
const ACTIVE_CLASS = 'bg-on-surface/8 font-semibold text-text-primary';
const INACTIVE_CLASS = 'font-medium text-text-secondary hover:bg-on-surface/5 hover:text-text-primary';

/**
 * HU-154 (T-215): único renderizador de los destinos del proyecto. La
 * sidebar (expandida y colapsada) y el Sheet móvil pintan exactamente los
 * grupos que les pasa `buildProjectNavGroups`, sin listas propias.
 */
export function ProjectNavList({ groups, activeHref, variant, onNavigate, id }: ProjectNavListProps) {
  if (variant === 'rail') {
    return (
      <ul id={id} className="flex flex-col items-center gap-micro">
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <li role="separator" aria-hidden="true" className="my-micro h-px w-8 bg-outline-variant" />}
            {group.items.map((item) => {
              const active = item.href === activeHref;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        onClick={onNavigate}
                        className={cn(
                          'flex size-10 items-center justify-center rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                          active ? ACTIVE_CLASS : INACTIVE_CLASS,
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden="true" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </Fragment>
        ))}
      </ul>
    );
  }

  return (
    <div id={id} className="flex flex-col gap-card">
      {groups.map((group) => (
        <div
          key={group.id}
          role={group.label ? 'group' : undefined}
          aria-labelledby={group.label ? `${id ?? 'project-nav'}-${group.id}` : undefined}
        >
          {group.label && (
            <p
              id={`${id ?? 'project-nav'}-${group.id}`}
              className="mb-tight px-inline text-xs font-semibold uppercase tracking-wider text-text-secondary"
            >
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-micro">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-inline rounded-control px-inline py-tight text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      active ? ACTIVE_CLASS : INACTIVE_CLASS,
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
