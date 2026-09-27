import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Lock, MapPin, Tag } from 'lucide-react';
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
  MODALIDAD_ICON,
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { MODALIDAD_LABEL, type ModalidadProyecto } from '@/types';

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

/** «Preparar cierre del proyecto»: enlace si el readiness lo permite, botón bloqueado con el motivo si no. */
export function ProjectClosureAction({ action }: { action: ClosureActionProps }) {
  if (action.enabled) {
    return (
      <Button asChild className="shrink-0 gap-tight bg-primary text-on-primary hover:bg-primary/90">
        <Link href={action.href}>
          <ClipboardCheck className="size-4" aria-hidden="true" />
          Preparar cierre del proyecto
        </Link>
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span envuelve el botón deshabilitado para que el tooltip reciba foco/hover (mismo patrón que role-admin-card.tsx) */}
        <span tabIndex={0} aria-label={action.reason ?? 'Preparar cierre del proyecto no disponible'} className="shrink-0">
          <Button
            type="button"
            disabled
            className="pointer-events-none w-full gap-tight border border-outline-variant bg-surface-container-high text-text-secondary"
          >
            <Lock className="size-4" aria-hidden="true" />
            Preparar cierre del proyecto
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{action.reason ?? 'Aún no puedes preparar el cierre.'}</TooltipContent>
    </Tooltip>
  );
}

export function getIniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

interface ProjectHeaderCardProps {
  /** Vuelta al listado de origen: «Mis proyectos» para el líder, «Proyectos disponibles» para el resto. */
  breadcrumb: { href: string; label: string };
  titulo: string;
  descripcion: string | null;
  tipoProyecto: string;
  estadoProyecto: string;
  modalidadProyecto: string;
  etiquetas?: string[];
  /** Muestra «Líder del proyecto» y la línea «Eres el responsable del proyecto». */
  lider?: { nombre: string; apellido: string } | null;
  /** Acción principal del encabezado (preparar cierre, postularse…). */
  acciones?: ReactNode;
}

/**
 * HU-154 (T-214/T-216): encabezado compartido del detalle de proyecto para
 * líder y participante: ruta de vuelta, etiquetas de estado/tipo/modalidad,
 * título, descripción corta y la acción principal. Las etiquetas de tipo y
 * estado usan el mapeo central de available-project-card.
 */
export function ProjectHeaderCard({
  breadcrumb,
  titulo,
  descripcion,
  tipoProyecto,
  estadoProyecto,
  modalidadProyecto,
  etiquetas = [],
  lider = null,
  acciones,
}: ProjectHeaderCardProps) {
  const ModalidadIcon = MODALIDAD_ICON[modalidadProyecto as ModalidadProyecto] ?? MapPin;

  return (
    <div className="flex flex-col gap-inline">
      <Breadcrumb>
        <BreadcrumbList className="type-meta">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={breadcrumb.href} className="text-text-secondary transition-colors hover:text-text-primary">
                {breadcrumb.label}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-xs truncate font-medium text-text-primary">{titulo}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section aria-label="Resumen del proyecto" className="card-base">
        <div className="flex flex-col gap-stack @2xl/project:flex-row @2xl/project:items-start @2xl/project:justify-between">
          <div className="flex min-w-0 flex-col gap-inline">
            <div className="flex flex-wrap items-center gap-tight">
              {lider && <span className="pill bg-primary text-on-primary">Líder del proyecto</span>}
              <span className={`pill ${estadoBadgeStyle(estadoProyecto)}`}>{estadoBadgeLabel(estadoProyecto)}</span>
              <span className={`pill ${tipoBadgeStyle(tipoProyecto)}`}>{tipoBadgeLabel(tipoProyecto)}</span>
              <span className="pill pill-neutral">
                <ModalidadIcon className="size-3" aria-hidden="true" />
                {MODALIDAD_LABEL[modalidadProyecto as ModalidadProyecto] ?? modalidadProyecto}
              </span>
            </div>

            <h1 className="type-display line-clamp-2">{titulo}</h1>
            <p className="type-body line-clamp-2 max-w-prose text-text-secondary">
              {descripcion || 'Sin descripción disponible.'}
            </p>

            {etiquetas.length > 0 && (
              <ul className="flex flex-wrap gap-micro" aria-label="Etiquetas del proyecto">
                {etiquetas.map((etiqueta) => (
                  <li key={etiqueta} className="pill pill-neutral">
                    <Tag className="size-3" aria-hidden="true" />
                    {etiqueta}
                  </li>
                ))}
              </ul>
            )}

            {lider && (
              <div className="flex items-center gap-tight">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {getIniciales(lider.nombre, lider.apellido)}
                  </AvatarFallback>
                </Avatar>
                <span className="type-meta">Eres el responsable del proyecto</span>
              </div>
            )}
          </div>

          {acciones && <div className="flex shrink-0 flex-col gap-tight">{acciones}</div>}
        </div>
      </section>
    </div>
  );
}
