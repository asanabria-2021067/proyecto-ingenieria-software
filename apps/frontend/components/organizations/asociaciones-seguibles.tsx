'use client';

import { AlertCircle, Landmark } from 'lucide-react';
import { BotonSeguir } from '@/components/organizations/boton-seguir';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { PROJECT_CARD_GRID, AvailableProjectCardSkeleton } from '@/components/projects/available-project-card';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAsociacionesSeguibles } from '@/hooks/use-descubrimiento';

/** MEJ-18: asociaciones oficiales activas, con «Seguir» para enterarte de los proyectos que publiquen. */
export function AsociacionesSeguibles() {
  const { data: asociaciones = [], isLoading, isError, refetch } = useAsociacionesSeguibles();

  if (isLoading) {
    return (
      <SkeletonRegion className={PROJECT_CARD_GRID} label="Cargando asociaciones">
        {Array.from({ length: 4 }).map((_, i) => (
          <AvailableProjectCardSkeleton key={i} />
        ))}
      </SkeletonRegion>
    );
  }

  if (isError) {
    return (
      <Empty tone="danger" className="surface-enter" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No se pudieron cargar las asociaciones</EmptyTitle>
          <EmptyDescription>Intenta nuevamente en unos segundos.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={() => refetch()}>
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (asociaciones.length === 0) {
    return (
      <Empty tone="muted" className="surface-enter" aria-live="polite">
        <EmptyMedia variant="icon">
          <Landmark aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Todavía no hay asociaciones</EmptyTitle>
          <EmptyDescription>Cuando administración registre una, podrás seguirla desde aquí.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={PROJECT_CARD_GRID}>
      {asociaciones.map((a) => (
        <div key={a.idAsociacion} data-testid={`asociacion-card-${a.idAsociacion}`} className="card-base flex min-h-40 flex-col">
          <div className="flex items-start gap-3">
            <OrgAvatar nombre={a.nombre} logoUrl={a.logoUrl} />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[17px] font-bold leading-5.5 text-on-surface">{a.nombre}</h3>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.carreras.map((c) => (
                  <Tag key={c} tone="slate" size="sm">
                    {c}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-inline line-clamp-3 text-[13px] leading-4.5 text-on-surface-variant">{a.descripcion || 'Sin descripción.'}</p>
          <div className="mt-auto flex justify-end pt-card">
            <BotonSeguir tipo="asociacion" id={a.idAsociacion} nombre={a.nombre} siguiendo={a.siguiendo} />
          </div>
        </div>
      ))}
    </div>
  );
}
