'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LeaveProjectModal } from '@/components/projects/leave-project-modal';
import type { ProjectAction } from './project-nav-model';

interface ProjectActionsMenuProps {
  idProyecto: number;
  actions: ProjectAction[];
  /**
   * `icon`: disparador compacto para la cabecera de la sidebar y el rail.
   * `labeled`: botón «Acciones» para la barra de navegación móvil.
   */
  variant?: 'icon' | 'labeled';
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/**
 * HU-154 (T-215): acciones secundarias del proyecto (editar, revisiones,
 * salida). Viven aquí y no en la navegación: la navegación solo lleva a
 * destinos. El mismo componente se usa en la sidebar expandida, en el rail
 * colapsado y en la barra móvil, así que una acción está disponible desde
 * cualquier subvista del proyecto.
 */
export function ProjectActionsMenu({
  idProyecto,
  actions,
  variant = 'icon',
  side = 'bottom',
  align = 'end',
}: ProjectActionsMenuProps) {
  const [salidaAbierta, setSalidaAbierta] = useState(false);

  if (actions.length === 0) return null;

  return (
    <>
      {/* modal={false}: el modal de salida se abre al cerrarse el menú y
          ambos no deben competir por bloquear el puntero del body. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          {variant === 'labeled' ? (
            <Button type="button" variant="outline" size="sm" aria-label="Acciones del proyecto" className="gap-tight">
              <MoreVertical className="size-4" aria-hidden="true" />
              Acciones
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <button
              type="button"
              aria-label="Acciones del proyecto"
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align={align} className="min-w-52">
          {actions.map((action) => {
            const Icon = action.icon;
            if (action.kind === 'link') {
              return (
                <DropdownMenuItem key={action.id} asChild>
                  <Link href={action.href}>
                    <Icon className="size-4" aria-hidden="true" />
                    {action.label}
                  </Link>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem key={action.id} onSelect={() => setSalidaAbierta(true)}>
                <Icon className="size-4" aria-hidden="true" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {actions.some((action) => action.kind === 'leave-modal') && (
        <LeaveProjectModal open={salidaAbierta} onOpenChange={setSalidaAbierta} idProyecto={idProyecto} />
      )}
    </>
  );
}
