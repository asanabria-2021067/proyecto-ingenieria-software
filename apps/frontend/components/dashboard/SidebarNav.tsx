'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

function isLeafActive(pathname: string, leaf: NavLeaf): boolean {
  return leaf.exact ? pathname === leaf.href : pathname.startsWith(leaf.href);
}

function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

interface SidebarNavProps {
  entries: NavEntry[];
  /** `admin`: usa los tokens `--admin-*` del sidebar oscuro de AdminLayout. */
  theme?: 'default' | 'admin';
}

/** Sidebar de escritorio: items simples + grupos expandibles con subopciones,
 *  auto-expandidos cuando la ruta activa cae dentro del grupo. Reutilizado por
 *  DashboardLayout y AdminLayout. */
export function SidebarNav({ entries, theme = 'default' }: SidebarNavProps) {
  const pathname = usePathname();
  const isAdmin = theme === 'admin';
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {entries.map((entry) => {
        if (entry.type !== 'group') {
          const active = isLeafActive(pathname, entry);
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
                  : `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'text-on-surface hover:bg-surface-container-high'
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

        const GroupIcon = entry.icon;
        const groupActiveByRoute = entry.items.some((item) => isLeafActive(pathname, item));
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
              className={
                isAdmin
                  ? 'admin-nav-inactive flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200'
                  : `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      groupActiveByRoute
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface hover:bg-surface-container-high'
                    }`
              }
              style={
                isAdmin
                  ? { color: groupActiveByRoute ? 'var(--admin-selector-bg)' : 'var(--admin-text-dim)' }
                  : undefined
              }
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
                  const active = isLeafActive(pathname, item);
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      id={`nav-item-${slug(item.label)}`}
                      aria-current={active ? 'page' : undefined}
                      className={
                        isAdmin
                          ? `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-all duration-200 ${!active ? 'admin-nav-inactive' : ''}`
                          : `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                              active
                                ? 'bg-primary text-on-primary'
                                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                            }`
                      }
                      style={
                        isAdmin
                          ? active
                            ? { backgroundColor: 'var(--admin-selector-bg)', color: 'var(--admin-selector-fg)' }
                            : { color: 'var(--admin-text-muted)' }
                          : undefined
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
    </nav>
  );
}
