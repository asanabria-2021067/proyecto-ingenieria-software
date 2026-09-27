'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ProjectActionsMenu } from './project-actions-menu';
import { ProjectNavList } from './project-nav-list';
import { buildProjectActions, buildProjectNavGroups, flattenNavItems, resolveActiveHref } from './project-nav-model';
import { useProjectNavContext } from './use-project-nav-context';

const ACTOR_LABEL = { leader: 'Líder', participant: 'Participante' } as const;

/**
 * HU-154 (T-215): navegación contextual del proyecto en tablet y móvil
 * (< lg), donde la sidebar del proyecto no se muestra. «Secciones» abre un
 * Sheet con exactamente los mismos grupos que la sidebar de escritorio, y
 * «Acciones» es el mismo menú de acciones secundarias. La barra inferior
 * global del dashboard no se toca.
 */
export function ProjectMobileNav({ idProyecto }: { idProyecto: number }) {
  const pathname = usePathname() ?? '';
  const nav = useProjectNavContext(idProyecto);
  const groups = buildProjectNavGroups(nav);
  const actions = buildProjectActions(nav);
  const activeHref = resolveActiveHref(groups, pathname);

  // El Sheet queda abierto solo para la ruta en la que se abrió: cualquier
  // navegación (un destino del propio Sheet, el botón atrás, un enlace de la
  // página) lo cierra sin necesidad de un efecto.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === pathname;

  // Un visitante solo tiene «Resumen» y ninguna acción: la barra no aportaría nada.
  if (flattenNavItems(groups).length <= 1 && actions.length === 0) return null;

  const titulo = nav.tituloProyecto ?? 'Proyecto';

  return (
    <div className="sticky top-0 z-20 flex items-center gap-tight border-b border-outline-variant bg-card px-stack py-tight lg:hidden">
      <Sheet open={abierto} onOpenChange={(open) => setAbiertoEn(open ? pathname : null)}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Menu className="size-4" aria-hidden="true" />
            Secciones
          </Button>
        </SheetTrigger>
        <SheetContent side="left" closeLabel="Cerrar secciones" className="w-72 gap-0 sm:max-w-72" aria-describedby={undefined}>
          <SheetHeader className="border-b border-outline-variant pr-section">
            <SheetTitle className="truncate text-sm font-bold text-on-surface">{titulo}</SheetTitle>
            {nav.actor !== 'visitor' && <span className="pill pill-accent w-fit">{ACTOR_LABEL[nav.actor]}</span>}
          </SheetHeader>
          <nav aria-label="Navegación del proyecto" className="overflow-y-auto p-inline">
            <ProjectNavList
              id={`project-mobile-nav-${idProyecto}`}
              groups={groups}
              activeHref={activeHref}
              variant="full"
              onNavigate={() => setAbiertoEn(null)}
            />
          </nav>
        </SheetContent>
      </Sheet>

      <p className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">{titulo}</p>

      <ProjectActionsMenu idProyecto={idProyecto} actions={actions} variant="labeled" />
    </div>
  );
}
