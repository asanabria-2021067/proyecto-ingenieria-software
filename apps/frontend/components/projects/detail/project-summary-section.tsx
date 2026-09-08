import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Lock, Tag } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { MODALIDAD_LABEL } from '@/types';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

/**
 * S7 (VIEW-01): la acción de cierre es un ENLACE a la preparación del cierre
 * (`/dashboard/projects/[id]/cierre`). Su habilitación la decide
 * `CloseReadinessSummary.canSubmit` (16 blockers del backend), no una
 * inferencia local; `reason` explica por qué está deshabilitada.
 */
export interface ClosureActionProps {
  href: string;
  enabled: boolean;
  reason: string | null;
}

const MIS_PROYECTOS_HREF = '/dashboard/projects/mine';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

interface ProjectSummarySectionProps {
  proyecto: ProyectoDetalleDTO;
  isLeader: boolean;
  isAdmin: boolean;
  puedeVerKanban: boolean;
  children?: ReactNode;
  /** S7 — único punto de entrada a la preparación del cierre (VIEW-13). `undefined` ⇒ no se muestra. */
  closureAction?: ClosureActionProps;
  /** Proyecto `CERRADO`: sin ninguna escritura (ni «Postularme»). */
  readOnly?: boolean;
}

export function ProjectSummarySection({
  proyecto,
  isLeader,
  isAdmin,
  puedeVerKanban,
  children,
  closureAction,
  readOnly = false,
}: ProjectSummarySectionProps) {
  return (
    <>
      {/* BREADCRUMB (Sección 8) */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={MIS_PROYECTOS_HREF} className="text-tertiary transition-colors hover:text-on-surface">
                Mis proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-xs truncate font-medium text-on-surface">
              {proyecto.tituloProyecto}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {children}

      {/* Fila 1: tarjeta principal · Responsable, con items-stretch para que
          ambas tarjetas queden a la misma altura, sin el escalón. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        {/* FILA 1 · COL 1 — Tarjeta principal (Sección 9-13) */}
        <div className={`${CARD} min-w-0`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                {/* Badges (Sección 10) */}
                <div className="flex flex-wrap items-center gap-2">
                  {isLeader && (
                    <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">
                      Líder del proyecto
                    </span>
                  )}
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
                    {estadoBadgeLabel(proyecto.estadoProyecto)}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoBadgeStyle(proyecto.tipoProyecto)}`}>
                    {tipoBadgeLabel(proyecto.tipoProyecto)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface-variant">
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ?? proyecto.modalidadProyecto}
                  </span>
                </div>

                {/* Título + descripción (Sección 11) */}
                <h1 className="font-headline text-2xl font-black leading-tight text-on-surface md:text-[28px]">
                  {proyecto.tituloProyecto}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                  {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                </p>

                {/* Etiquetas temáticas reales (Sección 11) */}
                {proyecto.intereses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {proyecto.intereses.map((pi) => (
                      <span
                        key={pi.idProyectoInteres}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant"
                      >
                        <Tag className="size-3" aria-hidden="true" />
                        {pi.interes.nombreInteres}
                      </span>
                    ))}
                  </div>
                )}

                {/* Resumen del responsable en el encabezado (Sección 12) */}
                {isLeader && (
                  <div className="flex items-center gap-2 pt-1">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
                        {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-on-surface-variant">
                      Eres el responsable del proyecto
                    </span>
                  </div>
                )}
              </div>

              {/* Para líder/participante estas acciones ahora viven en la barra de
                  tabs debajo del breadcrumb; aquí solo queda la única acción de
                  quien todavía no participa, más el disparador de cierre (F16). */}
              {!isLeader && !puedeVerKanban && !isAdmin && !readOnly && (
                <Button className="shrink-0 rounded-md bg-primary px-5 text-sm font-bold text-on-primary hover:bg-primary/90">
                  Postularme
                </Button>
              )}

              {closureAction && (
                closureAction.enabled ? (
                  <Button
                    asChild
                    className="shrink-0 gap-1.5 rounded-md bg-primary px-5 text-sm font-bold text-on-primary hover:bg-primary/90"
                  >
                    <Link href={closureAction.href}>
                      <ClipboardCheck className="size-4" aria-hidden="true" />
                      Preparar cierre del proyecto
                    </Link>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span envuelve el botón deshabilitado para que el tooltip reciba foco/hover (mismo patrón que role-admin-card.tsx) */}
                      <span
                        tabIndex={0}
                        aria-label={closureAction.reason ?? 'Preparar cierre del proyecto no disponible'}
                        className="shrink-0"
                      >
                        <Button
                          type="button"
                          disabled
                          className="pointer-events-none w-full gap-1.5 rounded-md border border-outline-variant bg-surface-container-high px-5 text-sm font-bold text-on-surface-variant"
                        >
                          <Lock className="size-4" aria-hidden="true" />
                          Preparar cierre del proyecto
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {closureAction.reason ?? 'Aún no puedes preparar el cierre.'}
                    </TooltipContent>
                  </Tooltip>
                )
              )}
            </div>
          </div>

        {/* FILA 1 · COL 2 — Responsable del proyecto (se estira a la altura de la
            tarjeta principal, alineando ambos bordes inferiores) */}
        <div className={`${CARD} flex flex-col`}>
          <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
            Responsable del proyecto
          </h2>
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">
                {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-surface">
                {proyecto.creador.nombre} {proyecto.creador.apellido}
              </p>
              <p className="truncate text-xs text-on-surface-variant">{proyecto.creador.correo}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
