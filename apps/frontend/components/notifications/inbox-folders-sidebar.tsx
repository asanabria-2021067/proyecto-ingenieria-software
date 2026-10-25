'use client';

import { useEffect, useRef, useState } from 'react';
import { Inbox, MailOpen, PanelLeftClose, PanelLeftOpen, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { INBOX_CATEGORIES } from '@/lib/notifications/inbox-model';
import type { NotificationGroupId } from '@/lib/notifications/preference-groups';
import { cn } from '@/lib/utils';

export type InboxFolder = 'recibidas' | 'no-leidas';

export interface InboxFoldersSelection {
  /** Bandeja: todas las recibidas o solo las no leídas. */
  bandeja: InboxFolder;
  /** Categoría activa; `null` = todas. */
  categoria: NotificationGroupId | null;
}

interface InboxFoldersSidebarProps {
  seleccion: InboxFoldersSelection;
  onSeleccionar: (seleccion: InboxFoldersSelection) => void;
  /** Contadores fiables (del servidor). Sin dato = no se muestra. */
  conteos: { noLeidas?: number; porCategoria?: Partial<Record<NotificationGroupId, number>> };
  collapsed: boolean;
  /** `undefined` = el ancho no permite expandir (rail forzado); el botón no se muestra. */
  onToggleCollapsed?: () => void;
  className?: string;
}

const TOGGLE_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-on-surface/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

const ACTIVE_CLASS = 'bg-sage-nav-active text-sage-nav-ink font-semibold shadow-[inset_3px_0_0_var(--color-sage-nav-accent)]';
const INACTIVE_CLASS = 'font-medium text-text-secondary hover:bg-on-surface/5 hover:text-text-primary';

interface FolderItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  count?: number;
  collapsed: boolean;
  onClick: () => void;
}

function FolderItem({ icon: Icon, label, active, count, collapsed, onClick }: FolderItemProps) {
  const contador = count !== undefined && count > 0 ? (count > 99 ? '99+' : String(count)) : null;
  const nombre = contador ? `${label}, ${count} sin leer` : label;
  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClick}
              aria-label={nombre}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'relative flex size-10 items-center justify-center rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                active ? ACTIVE_CLASS : INACTIVE_CLASS,
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {contador && (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-on-primary">
                  {contador}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{nombre}</TooltipContent>
        </Tooltip>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={nombre}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-inline rounded-control px-inline py-tight text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          active ? ACTIVE_CLASS : INACTIVE_CLASS,
        )}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {contador && (
          <span aria-hidden="true" className="pill pill-sm pill-accent tabular-nums">
            {contador}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Sprint 10 — sidebar secundaria de la bandeja (REGIÓN B). Mismo patrón que la
 * sidebar contextual del proyecto (`ProjectSidebar`): independiente de la
 * global, expandida con nombres o contraída a iconos con tooltip, sin perder
 * la selección. Las categorías son los grupos reales de preference-groups.ts.
 */
export function InboxFoldersSidebar({ seleccion, onSeleccionar, conteos, collapsed, onToggleCollapsed, className }: InboxFoldersSidebarProps) {
  const navId = 'inbox-folders-nav';

  // Al alternar, el botón pulsado desaparece y aparece su opuesto en el
  // mismo lugar: el foco se mueve a él para no perderse.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moverFoco = useRef(false);
  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    toggleRef.current?.focus();
  }, [collapsed]);

  // La preferencia guardada se aplica justo después de hidratar: sin esto,
  // una sidebar colapsada animaría su ancho en la primera carga.
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimar(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const alternar = () => {
    moverFoco.current = true;
    onToggleCollapsed?.();
  };

  const elegirBandeja = (bandeja: InboxFolder) => onSeleccionar({ ...seleccion, bandeja });
  const elegirCategoria = (categoria: NotificationGroupId) =>
    onSeleccionar({ ...seleccion, categoria: seleccion.categoria === categoria ? null : categoria });

  const toggle = onToggleCollapsed && (
    <button
      ref={toggleRef}
      type="button"
      onClick={alternar}
      aria-label={collapsed ? 'Expandir carpetas de notificaciones' : 'Contraer carpetas de notificaciones'}
      aria-expanded={!collapsed}
      aria-controls={navId}
      className={TOGGLE_CLASS}
    >
      {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
    </button>
  );

  return (
    <aside
      data-state={collapsed ? 'collapsed' : 'expanded'}
      aria-label="Carpetas de notificaciones"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sage-nav-border bg-sage-nav-surface',
        animar && 'transition-[width] duration-200 motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-56',
        className,
      )}
    >
      <div className={cn('flex items-center border-b border-sage-nav-border py-inline', collapsed ? 'justify-center' : 'justify-between px-stack')}>
        {!collapsed && <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Bandeja</p>}
        {collapsed ? (
          toggle && (
            <Tooltip>
              <TooltipTrigger asChild>{toggle}</TooltipTrigger>
              <TooltipContent side="right">Expandir carpetas</TooltipContent>
            </Tooltip>
          )
        ) : (
          toggle
        )}
      </div>

      <nav id={navId} aria-label="Carpetas y categorías" className={cn('min-h-0 flex-1 overflow-y-auto', collapsed ? 'px-tight py-inline' : 'px-inline py-stack')}>
        <ul className={cn('flex flex-col gap-micro', collapsed && 'items-center')} aria-label="Bandeja">
          <FolderItem
            icon={Inbox}
            label="Recibidas"
            collapsed={collapsed}
            active={seleccion.bandeja === 'recibidas'}
            onClick={() => elegirBandeja('recibidas')}
          />
          <FolderItem
            icon={MailOpen}
            label="No leídas"
            collapsed={collapsed}
            active={seleccion.bandeja === 'no-leidas'}
            count={conteos.noLeidas}
            onClick={() => elegirBandeja('no-leidas')}
          />
        </ul>

        {collapsed ? (
          <div role="separator" aria-hidden="true" className="mx-auto my-inline h-px w-8 bg-sage-nav-border" />
        ) : (
          <p id={`${navId}-categorias`} className="mb-tight mt-card px-inline text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Categorías
          </p>
        )}
        <ul className={cn('flex flex-col gap-micro', collapsed && 'items-center')} aria-labelledby={collapsed ? undefined : `${navId}-categorias`} aria-label={collapsed ? 'Categorías' : undefined}>
          {INBOX_CATEGORIES.map((categoria) => (
            <FolderItem
              key={categoria.id}
              icon={categoria.icon}
              label={categoria.titulo}
              collapsed={collapsed}
              active={seleccion.categoria === categoria.id}
              count={conteos.porCategoria?.[categoria.id]}
              onClick={() => elegirCategoria(categoria.id)}
            />
          ))}
        </ul>
      </nav>

      <div className={cn('border-t border-sage-nav-border text-text-secondary', collapsed ? 'flex justify-center py-inline' : 'flex items-center gap-tight px-stack py-inline')}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} aria-label="Notificaciones privadas de tu cuenta" className="flex size-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Notificaciones privadas de tu cuenta</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <p className="text-[11px] leading-tight">Notificaciones privadas de tu cuenta</p>
          </>
        )}
      </div>
    </aside>
  );
}
