'use client';

import Link from 'next/link';
import { Archive, Clock, FileSearch, FolderOpen } from 'lucide-react';
import { ADMIN_PROJECT_GROUPS, type AdminProjectGroup } from '@/lib/types/admin-projects';

export const ADMIN_PROJECT_GROUP_LABEL: Record<AdminProjectGroup, string> = {
  activos: 'Activos',
  revision: 'En revisión',
  cierres: 'Solicitudes de cierre',
  cerrados: 'Cerrados',
};

const GROUP_ICON: Record<AdminProjectGroup, typeof FolderOpen> = {
  activos: FolderOpen,
  revision: FileSearch,
  cierres: Clock,
  cerrados: Archive,
};

export function adminProjectsGroupHref(grupo: AdminProjectGroup): string {
  return `/dashboard/admin/proyectos?grupo=${grupo}`;
}

export interface AdminProjectsTabsProps {
  active: AdminProjectGroup;
  /** Conteos opcionales por grupo (solo se muestran los conocidos). */
  counts?: Partial<Record<AdminProjectGroup, number>>;
}

/**
 * VIEW-15 (F012) — las cuatro pestañas sincronizadas con `?grupo=`. Son
 * enlaces (no estado local) para que la pestaña activa sea compartible y
 * sobreviva a la recarga. Reutilizada por VIEW-16 para el breadcrumb/retorno.
 */
export function AdminProjectsTabs({ active, counts }: AdminProjectsTabsProps) {
  return (
    <nav aria-label="Grupos de proyectos" className="overflow-x-auto">
      <ul role="tablist" className="flex min-w-max items-center gap-1 border-b border-outline-variant/50">
        {ADMIN_PROJECT_GROUPS.map((grupo) => {
          const Icon = GROUP_ICON[grupo];
          const isActive = grupo === active;
          const count = counts?.[grupo];
          return (
            <li key={grupo} role="presentation">
              <Link
                href={adminProjectsGroupHref(grupo)}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-bold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isActive
                    ? 'border-primary text-on-surface'
                    : 'border-transparent text-tertiary hover:border-outline-variant hover:text-on-surface'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {ADMIN_PROJECT_GROUP_LABEL[grupo]}
                {typeof count === 'number' && (
                  <span className="rounded-full bg-surface-container-high px-1.5 text-[11px] font-semibold text-on-surface-variant">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
