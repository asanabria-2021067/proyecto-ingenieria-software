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
  badge?: number;
  /** Destino sin ruta (p. ej. «Mensajes», que abre un panel): se pinta como botón y no entra a la barra móvil. */
  onSelect?: () => void;
}

export interface NavGroup {
  type: 'group';
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
  /** Destino único que representa al grupo en la barra inferior móvil (sin él, van todos sus hijos). */
  mobile?: NavLeaf;
}

export type NavEntry = NavLeaf | NavGroup;

/** Aplana grupos a sus hijos — usado por la barra inferior móvil, que no tiene
 *  espacio para subopciones expandibles y necesita la lista plana original. */
export function flattenNavEntries(entries: NavEntry[]): NavLeaf[] {
  return entries.flatMap((entry) => (entry.type === 'group' ? (entry.mobile ? [entry.mobile] : entry.items) : entry.onSelect ? [] : [entry]));
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

/**
 * Hijos activos de un grupo. Si varios coinciden (`/dashboard/personas` contiene
 * a `/dashboard/personas?seccion=amigos`), solo cuenta el más específico, el de
 * `href` más largo: un único destino marcado por grupo.
 */
function activeItemHrefs(items: NavLeaf[], pathname: string, search?: string | null): Set<string> {
  const activos = items.filter((item) => isLeafActive(pathname, item, search));
  if (activos.length <= 1) return new Set(activos.map((item) => item.href));
  const masEspecifico = activos.reduce((mejor, item) => (item.href.length > mejor.href.length ? item : mejor));
  return new Set([masEspecifico.href]);
}

function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

/** Nombre accesible de un destino sin ruta: contiene el texto visible (WCAG 2.5.3) pero no empieza por él, para no confundirse con el botón «Mensajes» de la barra superior. */
function etiquetaAccion(leaf: NavLeaf): string {
  return `Abrir ${leaf.label.toLowerCase()}${leaf.badge ? `, ${leaf.badge} sin leer` : ''}`;
}

function NavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-black text-destructive-foreground">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{count} por atender</span>
    </span>
  );
}

/** Id de la navegación global: el control de colapsar del encabezado la referencia. */
export const DASHBOARD_NAV_ID = 'dashboard-global-nav';
/** Id de la navegación del administrador (mismo propósito). */
export const ADMIN_NAV_ID = 'admin-global-nav';

interface SidebarNavProps {
  entries: NavEntry[];
  /**
   * Solo elige la preferencia de plegado, los ids y los nombres accesibles: `admin` para
   * AdminLayout y `default` para DashboardLayout. El aspecto y el despliegue son los mismos
   * en las dos (la barra verde bosque del administrador, con sus tokens `--admin-*`).
   */
  theme?: 'default' | 'admin';
  /** Query string actual (`useSearchParams().toString()`), solo necesaria si algún `href` lleva `?`. */
  search?: string | null;
  /** Id del usuario actual — habilita la sección "Proyectos anclados" (solo tema `default`). */
  idUsuario?: number | null;
}

/** Sidebar de escritorio compartida por DashboardLayout y AdminLayout: grupos que se
 *  despliegan con chevron y guía vertical, destino activo con barra lima y, plegada, solo
 *  iconos con tooltip. Cada tema conserva su propia preferencia de plegado; el del
 *  estudiante añade «Proyectos anclados» al final y abre sus grupos de entrada (la guía
 *  de bienvenida señala destinos que están dentro de ellos). */
export function SidebarNav({ entries, theme = 'default', search = null, idUsuario = null }: SidebarNavProps) {
  const pathname = usePathname();
  const isAdmin = theme === 'admin';
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const dashboardSidebar = useDashboardSidebarCollapsed();
  const adminSidebar = useAdminSidebarCollapsed();
  const { collapsed, toggleCollapsed } = isAdmin ? adminSidebar : dashboardSidebar;
  const { pinned } = usePinnedProjects(idUsuario);
  const navId = isAdmin ? ADMIN_NAV_ID : DASHBOARD_NAV_ID;
  const navLabel = isAdmin ? 'Navegación administrativa' : 'Navegación principal';
  const anclados = isAdmin ? [] : pinned;

  if (collapsed) {
    return (
      <CollapsedSidebarNav
        entries={entries}
        pathname={pathname}
        search={search}
        pinned={anclados}
        onExpand={toggleCollapsed}
        navId={navId}
        navLabel={navLabel}
      />
    );
  }

  return (
    <nav id={navId} aria-label={navLabel} className="flex-1 space-y-1 px-3 py-4">
      {entries.map((entry) => {
        if (entry.type !== 'group') {
          const active = isLeafActive(pathname, entry, search);
          const Icon = entry.icon;
          if (entry.onSelect) {
            return (
              <button
                key={entry.href}
                type="button"
                id={`nav-item-${slug(entry.label)}`}
                onClick={entry.onSelect}
                aria-label={etiquetaAccion(entry)}
                aria-haspopup="dialog"
                className="admin-nav-item admin-nav-inactive w-full"
              >
                <Icon className="w-5 h-5 shrink-0" />
                {entry.label}
                <NavBadge count={entry.badge} />
              </button>
            );
          }
          return (
            <Link
              key={entry.href}
              href={entry.href}
              id={`nav-item-${slug(entry.label)}`}
              aria-current={active ? 'page' : undefined}
              className={`admin-nav-item ${!active ? 'admin-nav-inactive' : ''}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {entry.label}
              <NavBadge count={entry.badge} />
            </Link>
          );
        }

        const GroupIcon = entry.icon;
        const activos = activeItemHrefs(entry.items, pathname, search);
        const groupActiveByRoute = activos.size > 0;
        const expanded = expandedOverrides[entry.label] ?? (groupActiveByRoute || !isAdmin);
        const groupId = `nav-group-${slug(entry.label)}`;
        const groupBadge = entry.items.reduce((total, item) => total + (item.badge ?? 0), 0);

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
              {!expanded && <NavBadge count={groupBadge} />}
              <ChevronDown
                className={`admin-nav-chevron size-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              // Guía vertical alineada bajo el icono del padre (padding 0.75rem + mitad del icono).
              <div id={groupId} className="admin-nav-children ml-[1.375rem] mt-0.5 space-y-0.5 pl-2.5">
                {entry.items.map((item) => {
                  const active = activos.has(item.href);
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
                      <NavBadge count={item.badge} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <PinnedProjectsSection pinned={anclados} />
    </nav>
  );
}

function PinnedProjectsSection({ pinned }: { pinned: PinnedProject[] }) {
  if (pinned.length === 0) return null;
  return (
    <div className="space-y-1 pt-2">
      <p className="admin-nav-section-label px-3 pb-1 type-micro font-semibold uppercase tracking-wider">
        Proyectos anclados
      </p>
      {pinned.map((p) => (
        <Link
          key={p.idProyecto}
          href={`/dashboard/proyectos/${p.idProyecto}`}
          className="admin-nav-item admin-nav-inactive"
        >
          <span className="admin-account-avatar flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
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
  navId: string;
  navLabel: string;
}

/**
 * Sidebar reducida a solo iconos: todos los destinos (los de cada grupo, separados por un
 * divisor) con tooltip y el mismo activo de la barra abierta; al final, los proyectos
 * anclados del estudiante.
 */
function CollapsedSidebarNav({ entries, pathname, search, pinned, onExpand, navId, navLabel }: CollapsedSidebarNavProps) {
  const renderLeaf = (leaf: NavLeaf, active = isLeafActive(pathname, leaf, search)) => {
    const Icon = leaf.icon;
    if (leaf.onSelect) {
      return (
        <Tooltip key={leaf.href}>
          <TooltipTrigger asChild>
            <button
              type="button"
              id={`nav-item-${slug(leaf.label)}`}
              aria-label={etiquetaAccion(leaf)}
              aria-haspopup="dialog"
              onClick={leaf.onSelect}
              className="admin-nav-item admin-nav-icon admin-nav-inactive"
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{leaf.label}</TooltipContent>
        </Tooltip>
      );
    }
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
    <nav id={navId} aria-label={navLabel} className="flex flex-1 flex-col items-center gap-1 px-2 py-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expandir barra lateral"
            aria-expanded={false}
            aria-controls={navId}
            className="admin-nav-item admin-nav-icon admin-nav-inactive"
          >
            <PanelLeftOpen className="size-4.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expandir</TooltipContent>
      </Tooltip>

      {entries.map((entry) => {
        if (entry.type !== 'group') {
          return (
            <div key={entry.href} className="flex flex-col items-center gap-1">
              <div role="separator" aria-hidden="true" className="admin-nav-separator my-1 h-px w-8" />
              {renderLeaf(entry)}
            </div>
          );
        }
        const activos = activeItemHrefs(entry.items, pathname, search);
        return (
          <div key={entry.label} role="group" aria-label={entry.label} className="flex flex-col items-center gap-1">
            <div role="separator" aria-hidden="true" className="admin-nav-separator my-1 h-px w-8" />
            {entry.items.map((item) => renderLeaf(item, activos.has(item.href)))}
          </div>
        );
      })}

      {pinned.length > 0 && (
        <div role="group" aria-label="Proyectos anclados" className="flex flex-col items-center gap-1">
          <div role="separator" aria-hidden="true" className="admin-nav-separator my-1 h-px w-8" />
          {pinned.map((p) => (
            <Tooltip key={p.idProyecto}>
              <TooltipTrigger asChild>
                <Link
                  href={`/dashboard/proyectos/${p.idProyecto}`}
                  aria-label={p.tituloProyecto}
                  className="admin-nav-item admin-nav-icon admin-nav-inactive"
                >
                  <span className="admin-account-avatar flex size-6 items-center justify-center rounded-full text-xs font-bold">
                    {p.tituloProyecto.charAt(0).toUpperCase()}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{p.tituloProyecto}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </nav>
  );
}

/**
 * Control del sidebar global (no es un destino de navegación): vive en el
 * encabezado junto a la marca, como el de la sidebar contextual del proyecto.
 * Mismo aspecto en los dos temas; `admin` usa la preferencia de plegado del
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
          className="admin-collapse-toggle ml-auto flex size-8 shrink-0 items-center justify-center rounded-control transition-colors"
        >
          <PanelLeftClose className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Colapsar</TooltipContent>
    </Tooltip>
  );
}
