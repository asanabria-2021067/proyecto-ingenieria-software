'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectChatPanel } from '@/components/projects/project-chat-panel';
import { ProjectActionsMenu } from '@/components/projects/navigation/project-actions-menu';
import { ProjectNavList } from '@/components/projects/navigation/project-nav-list';
import {
  buildProjectActions,
  buildProjectNavGroups,
  resolveActiveHref,
} from '@/components/projects/navigation/project-nav-model';
import { useProjectNavContext } from '@/components/projects/navigation/use-project-nav-context';
import { useProjectSidebarCollapsed } from '@/components/projects/navigation/use-project-sidebar-collapsed';
import { cn } from '@/lib/utils';

interface ProjectSidebarProps {
  idProyecto: number;
}

const ACTOR_LABEL = { leader: 'Líder', participant: 'Participante' } as const;

const TOGGLE_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * HU-154 (T-215): sidebar contextual del proyecto, independiente de la
 * sidebar global. Destinos y acciones salen del modelo compartido
 * (`project-nav-model`), así que expandida y colapsada ofrecen exactamente
 * lo mismo: colapsar solo cambia la presentación (iconos con tooltip).
 */
export function ProjectSidebar({ idProyecto }: ProjectSidebarProps) {
  const pathname = usePathname() ?? '';
  const nav = useProjectNavContext(idProyecto);
  const { collapsed, setCollapsed } = useProjectSidebarCollapsed();

  const groups = buildProjectNavGroups(nav);
  const actions = buildProjectActions(nav);
  const activeHref = resolveActiveHref(groups, pathname);
  const puedeChatear = nav.actor !== 'visitor';
  const navId = `project-nav-${idProyecto}`;

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

  const alternar = (next: boolean) => {
    moverFoco.current = true;
    setCollapsed(next);
  };

  return (
    <aside
      data-state={collapsed ? 'collapsed' : 'expanded'}
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-outline-variant bg-surface-container-low md:flex',
        animar && 'transition-[width] duration-200 motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-micro border-b border-outline-variant py-inline">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={toggleRef}
                type="button"
                onClick={() => alternar(false)}
                aria-label="Expandir navegación del proyecto"
                aria-expanded={false}
                aria-controls={navId}
                className={TOGGLE_CLASS}
              >
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir navegación</TooltipContent>
          </Tooltip>
          <ProjectActionsMenu idProyecto={idProyecto} actions={actions} side="right" align="start" />
        </div>
      ) : (
        <div className="border-b border-outline-variant px-stack py-stack">
          <div className="flex items-center gap-tight">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
              {nav.tituloProyecto ?? 'Proyecto'}
            </p>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => alternar(true)}
              aria-label="Contraer navegación del proyecto"
              aria-expanded={true}
              aria-controls={navId}
              className={TOGGLE_CLASS}
            >
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </button>
          </div>
          {(nav.actor !== 'visitor' || actions.length > 0) && (
            <div className="mt-tight flex items-center justify-between gap-tight">
              {nav.actor !== 'visitor' ? <span className="pill pill-accent">{ACTOR_LABEL[nav.actor]}</span> : <span />}
              <ProjectActionsMenu idProyecto={idProyecto} actions={actions} align="start" />
            </div>
          )}
        </div>
      )}

      <nav
        aria-label="Navegación del proyecto"
        className={cn('overflow-y-auto', collapsed ? 'px-tight py-inline' : 'p-inline')}
      >
        <ProjectNavList id={navId} groups={groups} activeHref={activeHref} variant={collapsed ? 'rail' : 'full'} />
      </nav>

      {collapsed && puedeChatear && (
        <div className="flex justify-center border-t border-outline-variant py-inline">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => alternar(false)}
                aria-label="Mostrar chats del proyecto"
                className={TOGGLE_CLASS}
              >
                <MessageSquare className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Chats</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* El panel sigue montado aunque la sidebar esté colapsada: el botón
          «Chat» del responsable (requestChatWith) abre la conversación en un
          Sheet con portal, que no depende de que la lista sea visible. */}
      <div className={collapsed ? 'hidden' : 'contents'}>
        <ProjectChatPanel
          idProyecto={idProyecto}
          habilitado={puedeChatear}
          currentUserId={nav.currentUserId}
          members={nav.members}
        />
      </div>
    </aside>
  );
}
