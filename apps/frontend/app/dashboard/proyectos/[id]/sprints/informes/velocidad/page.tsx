'use client';

import { useParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useSprintsAnalytics } from '@/hooks/use-project-sprints';
import { VelocityChart } from '@/components/projects/velocity-chart';
import { Skeleton } from '@/components/ui/skeleton';
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

      {isLoading && <Skeleton className="h-[340px] w-full rounded-xl" />}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'general', 'No fue posible cargar la velocidad del proyecto.')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <VelocityChart sprints={sprints} />
        </div>
      )}
    </ProjectPageShell>
  );
}
