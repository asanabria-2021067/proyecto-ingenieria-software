'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NewChatDialog } from '@/components/chat-dock/new-chat-dialog';
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
  'flex size-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-on-surface/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * HU-154 (T-215): sidebar contextual del proyecto, independiente de la
 * sidebar global. Se lee como navegación secundaria: fondo gris claro frente
 * al blanco de la global, una cabecera ligera (rol + acciones + contraer;
 * el nombre ya está en el breadcrumb y el título) y el chat del proyecto
 * fijo abajo, separado del menú. Destinos y acciones salen del modelo compartido
 * (`project-nav-model`), así que expandida y colapsada ofrecen exactamente
 * lo mismo: colapsar solo cambia la presentación (iconos con tooltip).
 *
 * Visible desde lg: por debajo, la sidebar global (231 px) y esta dejarían
 * sin espacio al contenido, y la sustituye ProjectMobileNav.
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
  const [nuevoChatAbierto, setNuevoChatAbierto] = useState(false);

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
        'hidden h-full shrink-0 flex-col border-r border-outline-variant bg-surface-container lg:flex',
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
        <div className="flex items-center gap-tight border-b border-outline-variant px-stack py-inline">
          {nav.actor !== 'visitor' && (
            // Etiqueta rectangular (radio moderado, no pastilla) con más
            // presencia horizontal; conserva el lima del acento.
            <span className="pill pill-accent min-w-20 justify-center rounded-md px-stack font-semibold">
              {ACTOR_LABEL[nav.actor]}
            </span>
          )}
          <div className="ml-auto flex items-center gap-micro">
            <ProjectActionsMenu idProyecto={idProyecto} actions={actions} align="start" />
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
        </div>
      )}

      {/* El menú ocupa el espacio libre y hace scroll propio; así el chat del
          proyecto queda siempre abajo, visible mientras la altura lo permita. */}
      <nav
        aria-label="Navegación del proyecto"
        className={cn('min-h-0 flex-1 overflow-y-auto', collapsed ? 'px-tight py-inline' : 'px-inline py-stack')}
      >
        <ProjectNavList id={navId} groups={groups} activeHref={activeHref} variant={collapsed ? 'rail' : 'full'} />
      </nav>

      {/* Los chats del proyecto viven en el dock global (esquina inferior
          derecha, cualquier página del dashboard) — acá solo queda el
          punto de entrada para iniciar uno nuevo. */}
      {puedeChatear && (
        <div className={collapsed ? 'flex justify-center border-t border-outline-variant py-inline' : 'border-t border-outline-variant px-inline py-inline'}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setNuevoChatAbierto(true)}
                  aria-label="Nuevo chat del proyecto"
                  className={TOGGLE_CLASS}
                >
                  <MessageSquarePlus className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Nuevo chat</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setNuevoChatAbierto(true)}
              className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-on-surface/5 hover:text-text-primary"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              Nuevo chat del proyecto
            </button>
          )}
        </div>
      )}

      <NewChatDialog
        open={nuevoChatAbierto}
        onOpenChange={setNuevoChatAbierto}
        idProyecto={idProyecto}
        members={nav.members}
        currentUserId={nav.currentUserId}
      />
    </aside>
  );
}
