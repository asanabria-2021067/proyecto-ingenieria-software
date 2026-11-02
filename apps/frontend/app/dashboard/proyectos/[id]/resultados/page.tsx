'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Lock } from 'lucide-react';
import { useResultadosProyecto } from '@/hooks/use-seguimiento';
import { getApiErrorStatus } from '@/components/projects/api-error';
import { ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { ResultadosContenido } from '@/components/projects/resultados-contenido';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';

function ResultadosSkeleton() {
  return (
    <SkeletonRegion label="Cargando los resultados" className="flex flex-col gap-section">
      <Skeleton className="h-10 w-80" />
      <div className="grid grid-cols-2 gap-grid @3xl/project:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-card" />
    </SkeletonRegion>
  );
}

export default function ResultadosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const { data, isLoading, isError, error, refetch } = useResultadosProyecto(idProyecto);
  const status = isError ? getApiErrorStatus(error) : undefined;

  return (
    <ProjectPageShell>
      {isLoading && <ResultadosSkeleton />}

      {isError && (status === 400 || status === 403 || status === 404) && (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Lock aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {status === 400 ? 'Los resultados se publican al cerrar el proyecto' : 'No puedes ver los resultados de este proyecto'}
            </EmptyTitle>
            <EmptyDescription>
              {status === 400
                ? 'Cuando la administración apruebe el cierre, aquí verás el resumen del trabajo del equipo.'
                : 'Solo las personas relacionadas con el proyecto pueden consultarlos.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href={status === 404 ? '/dashboard/proyectos' : `/dashboard/proyectos/${idProyecto}`}>
                {status === 404 ? 'Ir a proyectos' : 'Volver al proyecto'}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {isError && status !== 400 && status !== 403 && status !== 404 && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No fue posible cargar los resultados</EmptyTitle>
            <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {data && <ResultadosContenido resultados={data} idProyecto={idProyecto} />}
    </ProjectPageShell>
  );
}
