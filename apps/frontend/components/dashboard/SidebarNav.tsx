'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDashboardSidebarCollapsed } from '@/components/dashboard/use-dashboard-sidebar-collapsed';
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
 *  (no colapsables) + colapsado a solo iconos + "Proyectos anclados" al
 *  final; tema `admin` conserva sus grupos expandibles con chevron.
 *  Reutilizado por DashboardLayout y AdminLayout. */
export function SidebarNav({ entries, theme = 'default', search = null, idUsuario = null }: SidebarNavProps) {
  const pathname = usePathname();
  const isAdmin = theme === 'admin';
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const { collapsed, toggleCollapsed } = useDashboardSidebarCollapsed();
  const { pinned } = usePinnedProjects(idUsuario);

  if (!isAdmin && collapsed) {
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
    <nav className="flex-1 space-y-1 px-3 py-4">
      {!isAdmin && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Colapsar barra lateral"
          className={`mb-1 flex w-full items-center gap-inline rounded-control px-inline py-tight text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${LEAF_INACTIVE_CLASS}`}
        >
          <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
          Colapsar
        </button>
      )}

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
                  ? `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all duration-200 ${!active ? 'admin-nav-inactive' : ''}`
                  : `flex items-center gap-inline rounded-control px-inline py-tight text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      active ? LEAF_ACTIVE_CLASS : LEAF_INACTIVE_CLASS
                    }`
              }
              style={
                isAdmin
                  ? active
                    ? { backgroundColor: 'var(--admin-selector-bg)', color: 'var(--admin-selector-fg)' }
                    : { color: 'var(--admin-text-dim)' }
                  : undefined
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
              className="admin-nav-inactive flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200"
              style={{ color: groupActiveByRoute ? 'var(--admin-selector-bg)' : 'var(--admin-text-dim)' }}
            >
              <GroupIcon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">{entry.label}</span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <div id={groupId} className="ml-4 space-y-1 border-l border-outline-variant/50 pl-3">
                {entry.items.map((item) => {
                  const active = isLeafActive(pathname, item, search);
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      id={`nav-item-${slug(item.label)}`}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-all duration-200 ${!active ? 'admin-nav-inactive' : ''}`}
                      style={
                        active
                          ? { backgroundColor: 'var(--admin-selector-bg)', color: 'var(--admin-selector-fg)' }
                          : { color: 'var(--admin-text-muted)' }
                      }
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
    <nav className="flex flex-1 flex-col items-center gap-micro px-2 py-4">
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
