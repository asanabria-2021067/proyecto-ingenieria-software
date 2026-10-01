'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useAdminSidebarCollapsed,
  useDashboardSidebarCollapsed,
} from '@/components/dashboard/use-dashboard-sidebar-collapsed';
import { usePinnedProjects, type PinnedProject } from '@/hooks/use-pinned-projects';

export interface NavLeaf {
  type?: 'link';
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface NavGroup {
  type: 'group';
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

/** Aplana grupos a sus hijos — usado por la barra inferior móvil, que no tiene
 *  espacio para subopciones expandibles y necesita la lista plana original. */
export function flattenNavEntries(entries: NavEntry[]): NavLeaf[] {
  return entries.flatMap((entry) => (entry.type === 'group' ? entry.items : [entry]));
}

/**
 * S7: un destino puede llevar query (`/dashboard/admin/proyectos?grupo=activos`).
 * `usePathname` nunca incluye la query, así que esos destinos se comparan por
 * ruta exacta + parámetros presentes en `search` (los del `href` deben
 * coincidir todos). Los destinos sin query conservan el criterio anterior.
 */
function isLeafActive(pathname: string, leaf: NavLeaf, search?: string | null): boolean {
  const [hrefPath, hrefQuery] = leaf.href.split('?');
  if (hrefQuery) {
    if (pathname !== hrefPath) return false;
    const actual = new URLSearchParams(search ?? '');
    return [...new URLSearchParams(hrefQuery).entries()].every(([k, v]) => actual.get(k) === v);
  }
  return leaf.exact ? pathname === leaf.href : pathname.startsWith(leaf.href);
}

function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

/** Id de la navegación global: el control de colapsar del encabezado la referencia. */
export const DASHBOARD_NAV_ID = 'dashboard-global-nav';
/** Id de la navegación del administrador (mismo propósito). */
export const ADMIN_NAV_ID = 'admin-global-nav';

const LEAF_ACTIVE_CLASS = 'bg-action text-on-action shadow-card';
const LEAF_INACTIVE_CLASS = 'text-text-secondary hover:bg-muted hover:text-text-primary';

interface SidebarNavProps {
  entries: NavEntry[];
  /** `admin`: usa los tokens `--admin-*` del sidebar oscuro de AdminLayout. */
  theme?: 'default' | 'admin';
  /** Query string actual (`useSearchParams().toString()`), solo necesaria si algún `href` lleva `?`. */
  search?: string | null;
  /** Id del usuario actual — habilita la sección "Proyectos anclados" (solo tema `default`). */
  idUsuario?: number | null;
}

/** Sidebar de escritorio: tema `default` usa encabezados de sección sutiles
 *  (no colapsables) + "Proyectos anclados" al final; tema `admin` conserva
 *  sus grupos expandibles con chevron. Ambos se colapsan a solo iconos, cada
 *  uno con su propia preferencia. Reutilizado por DashboardLayout y AdminLayout. */
export function SidebarNav({ entries, theme = 'default', search = null, idUsuario = null }: SidebarNavProps) {
  const pathname = usePathname();
  const isAdmin = theme === 'admin';
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const dashboardSidebar = useDashboardSidebarCollapsed();
  const adminSidebar = useAdminSidebarCollapsed();
  const { collapsed, toggleCollapsed } = isAdmin ? adminSidebar : dashboardSidebar;
  const { pinned } = usePinnedProjects(idUsuario);

  if (isAdmin && collapsed) {
    return <AdminCollapsedSidebarNav entries={entries} pathname={pathname} search={search} onExpand={toggleCollapsed} />;
  }

  if (collapsed) {
    return (
      <CollapsedSidebarNav
        entries={entries}
        pathname={pathname}
        search={search}
        pinned={pinned}
        onExpand={toggleCollapsed}
      />
    );
  }

  return (
    <nav
      id={isAdmin ? ADMIN_NAV_ID : DASHBOARD_NAV_ID}
      aria-label={isAdmin ? 'Navegación administrativa' : 'Navegación principal'}
      className="flex-1 space-y-1 px-3 py-4"
    >

      {entries.map((entry) => {
        if (entry.type !== 'group') {
          const active = isLeafActive(pathname, entry, search);
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              id={`nav-item-${slug(entry.label)}`}
              aria-current={active ? 'page' : undefined}
              className={
                isAdmin
                  ? `admin-nav-item ${!active ? 'admin-nav-inactive' : ''}`
                  : `flex items-center gap-inline rounded-control px-inline py-tight text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      active ? LEAF_ACTIVE_CLASS : LEAF_INACTIVE_CLASS
                    }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {entry.label}
            </Link>
          );
        }

        if (!isAdmin) {
          // Tema default: encabezado de sección sutil, siempre visible — sin
          // acordeón. Mismo patrón que "Trabajo"/"Seguimiento" en la sidebar
          // contextual del proyecto (ver navigation/project-nav-list.tsx).
          const groupId = `nav-group-${slug(entry.label)}`;
          return (
            <div key={entry.label} id={groupId} className="space-y-1 pt-2" role="group" aria-labelledby={`${groupId}-label`}>
              <p
                id={`${groupId}-label`}
                className="mb-tight px-inline text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                {entry.label}
              </p>
              {entry.items.map((item) => {
                const active = isLeafActive(pathname, item, search);
                const ItemIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    id={`nav-item-${slug(item.label)}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-inline rounded-control px-inline py-tight text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      active ? LEAF_ACTIVE_CLASS : LEAF_INACTIVE_CLASS
                    }`}
                  >
                    <ItemIcon className="w-5 h-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        }

        const GroupIcon = entry.icon;
        const groupActiveByRoute = entry.items.some((item) => isLeafActive(pathname, item, search));
        const expanded = expandedOverrides[entry.label] ?? groupActiveByRoute;
        const groupId = `nav-group-${slug(entry.label)}`;

        return (
          <div key={entry.label} className="space-y-1">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={groupId}
              onClick={() =>
                setExpandedOverrides((current) => ({ ...current, [entry.label]: !expanded }))
              }
              data-state={expanded ? 'open' : 'closed'}
              className="admin-nav-item admin-nav-group admin-nav-inactive w-full"
            >
              <GroupIcon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">{entry.label}</span>
              <ChevronDown
                className={`admin-nav-chevron size-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              // Guía vertical alineada bajo el icono del padre (padding 0.75rem + mitad del icono).
              <div id={groupId} className="admin-nav-children ml-[1.375rem] mt-0.5 space-y-0.5 pl-2.5">
                {entry.items.map((item) => {
                  const active = isLeafActive(pathname, item, search);
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      id={`nav-item-${slug(item.label)}`}
                      aria-current={active ? 'page' : undefined}
                      className={`admin-nav-subitem ${!active ? 'admin-nav-inactive' : ''}`}
                    >
                      <ItemIcon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {!isAdmin && <PinnedProjectsSection pinned={pinned} />}
    </nav>
  );
}

function PinnedProjectsSection({ pinned }: { pinned: PinnedProject[] }) {
  if (pinned.length === 0) return null;
  return (
    <div className="space-y-1 pt-2">
      <p className="mb-tight px-inline text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Proyectos anclados
      </p>
      {pinned.map((p) => (
        <Link
          key={p.idProyecto}
          href={`/dashboard/proyectos/${p.idProyecto}`}
          className={`flex items-center gap-tight rounded-control px-inline py-tight text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${LEAF_INACTIVE_CLASS}`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-container text-[10px] font-bold text-on-secondary-container">
            {p.tituloProyecto.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{p.tituloProyecto}</span>
        </Link>
      ))}
    </div>
  );
}

interface CollapsedSidebarNavProps {
  entries: NavEntry[];
  pathname: string;
  search: string | null;
  pinned: PinnedProject[];
  onExpand: () => void;
}

/** Sidebar reducida a solo iconos (tema default): cada destino y proyecto
 *  anclado muestra su tooltip al pasar el cursor. */
function CollapsedSidebarNav({ entries, pathname, search, pinned, onExpand }: CollapsedSidebarNavProps) {
  const leaves = flattenNavEntries(entries);

  return (
    <nav
      id={DASHBOARD_NAV_ID}
      aria-label="Navegación principal"
      className="flex flex-1 flex-col items-center gap-micro px-2 py-4"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expandir barra lateral"
            className="flex size-10 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-muted hover:text-text-primary"
          >
            <PanelLeftOpen className="size-4.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expandir</TooltipContent>
      </Tooltip>

      <div role="separator" aria-hidden="true" className="my-micro h-px w-8 bg-outline-variant" />

      {leaves.map((leaf) => {
        const active = isLeafActive(pathname, leaf, search);
        const Icon = leaf.icon;
        return (
          <Tooltip key={leaf.href}>
            <TooltipTrigger asChild>
              <Link
                href={leaf.href}
                id={`nav-item-${slug(leaf.label)}`}
                aria-label={leaf.label}
                aria-current={active ? 'page' : undefined}
                className={`flex size-10 items-center justify-center rounded-control transition-colors ${
                  active ? LEAF_ACTIVE_CLASS : LEAF_INACTIVE_CLASS
                }`}
              >
                <Icon className="size-4.5" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{leaf.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {pinned.length > 0 && (
        <>
          <div role="separator" aria-hidden="true" className="my-micro h-px w-8 bg-outline-variant" />
          {pinned.map((p) => (
            <Tooltip key={p.idProyecto}>
              <TooltipTrigger asChild>
                <Link
                  href={`/dashboard/proyectos/${p.idProyecto}`}
                  aria-label={p.tituloProyecto}
                  className="flex size-10 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-on-secondary-container transition-opacity hover:opacity-80"
                >
                  {p.tituloProyecto.charAt(0).toUpperCase()}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{p.tituloProyecto}</TooltipContent>
            </Tooltip>
          ))}
        </>
      )}
    </nav>
  );
}

/**
 * Control del sidebar global (no es un destino de navegación): vive en el
 * encabezado junto a la marca, como el de la sidebar contextual del proyecto.
 * `admin` usa la preferencia y los colores graphite de la sidebar del
 * administrador.
 */
export function DashboardSidebarCollapseButton({ theme = 'default' }: { theme?: 'default' | 'admin' }) {
  const dashboardSidebar = useDashboardSidebarCollapsed();
  const adminSidebar = useAdminSidebarCollapsed();
  const isAdmin = theme === 'admin';
  const { toggleCollapsed } = isAdmin ? adminSidebar : dashboardSidebar;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Colapsar barra lateral"
          aria-expanded={true}
          aria-controls={isAdmin ? ADMIN_NAV_ID : DASHBOARD_NAV_ID}
          className={
            isAdmin
              ? 'admin-collapse-toggle ml-auto flex size-8 shrink-0 items-center justify-center rounded-control transition-colors'
              : 'ml-auto flex size-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-on-surface/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
          }
        >
          <PanelLeftClose className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Colapsar</TooltipContent>
    </Tooltip>
  );
}

interface AdminCollapsedSidebarNavProps {
  entries: NavEntry[];
  pathname: string;
  search: string | null;
  onExpand: () => void;
}

/**
 * Sidebar del administrador reducida a solo iconos: todos los destinos
 * (los de cada grupo, separados por un divisor) con tooltip y el mismo
 * activo graphite + barra lima.
 */
function AdminCollapsedSidebarNav({ entries, pathname, search, onExpand }: AdminCollapsedSidebarNavProps) {
  const renderLeaf = (leaf: NavLeaf) => {
    const active = isLeafActive(pathname, leaf, search);
    const Icon = leaf.icon;
    return (
      <Tooltip key={leaf.href}>
        <TooltipTrigger asChild>
          <Link
            href={leaf.href}
            id={`nav-item-${slug(leaf.label)}`}
            aria-label={leaf.label}
            aria-current={active ? 'page' : undefined}
            className={`admin-nav-item admin-nav-icon ${!active ? 'admin-nav-inactive' : ''}`}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{leaf.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav
      id={ADMIN_NAV_ID}
      aria-label="Navegación administrativa"
      className="flex flex-1 flex-col items-center gap-1 px-2 py-4"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expandir barra lateral"
            aria-expanded={false}
            aria-controls={ADMIN_NAV_ID}
            className="admin-nav-item admin-nav-icon admin-nav-inactive"
          >
            <PanelLeftOpen className="size-4.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expandir</TooltipContent>
      </Tooltip>

      {entries.map((entry) =>
        entry.type === 'group' ? (
          <div key={entry.label} role="group" aria-label={entry.label} className="flex flex-col items-center gap-1">
            <div role="separator" aria-hidden="true" className="admin-nav-separator my-1 h-px w-8" />
            {entry.items.map(renderLeaf)}
          </div>
        ) : (
          <div key={entry.href} className="flex flex-col items-center gap-1">
            <div role="separator" aria-hidden="true" className="admin-nav-separator my-1 h-px w-8" />
            {renderLeaf(entry)}
          </div>
        ),
      )}
    </nav>
  );
}
