import { dashboardPage } from '@/components/layout/dashboard-page';
import { Skeleton, SkeletonDetail, SkeletonRegion } from '@/components/ui/skeleton';

/**
 * HU-204: carga de la sesión antes de pintar el shell (estudiante o admin).
 * Reproduce barra lateral, barra superior y contenido para que la página no
 * salte de un spinner centrado a la vista real.
 */
export function ShellSkeleton() {
  return (
    <SkeletonRegion label="Cargando UVGenius" className="fixed inset-0 flex overflow-hidden bg-page">
      <div aria-hidden="true" className="hidden w-64 shrink-0 flex-col gap-stack border-r border-outline-variant bg-card p-card md:flex">
        <Skeleton className="mb-stack h-10 w-36" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-control" />
        ))}
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-inline border-b border-outline-variant bg-card px-stack md:px-section">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="hidden h-9 w-full max-w-sm rounded-control md:block" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className={dashboardPage('flex-1 overflow-hidden py-section')}>
          <SkeletonDetail />
        </div>
      </div>
    </SkeletonRegion>
  );
}
