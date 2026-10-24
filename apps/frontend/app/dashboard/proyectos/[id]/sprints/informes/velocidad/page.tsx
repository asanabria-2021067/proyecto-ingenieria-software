'use client';

import { useParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useSprintsAnalytics } from '@/hooks/use-project-sprints';
import { VelocityChart } from '@/components/projects/velocity-chart';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/**
 * Informe dedicado de velocidad: mismo VelocityChart de la analitica
 * comparativa, aparte, para el flujo "Ver informes -> elegir grafica -> ver
 * el detalle completo" (referencia: paginas de informe de Jira).
 */
export default function InformeVelocidadPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { sprints, isLoading, isError, error, refetch } = useSprintsAnalytics(idProyecto);

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints/analytics`, label: 'Volver a Analítica comparativa' }}
        title="Informe de velocidad"
        description="Story points completados por cada Sprint cerrado, frente al promedio del proyecto."
      />

      {isLoading && (
        <SkeletonRegion label="Cargando velocidad">
          <Skeleton className="h-[340px] w-full rounded-xl" />
        </SkeletonRegion>
      )}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'general', 'No fue posible cargar la velocidad del proyecto.')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && (
        <div className="card-base">
          <VelocityChart sprints={sprints} />
        </div>
      )}
    </ProjectPageShell>
  );
}
