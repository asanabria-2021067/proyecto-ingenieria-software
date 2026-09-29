'use client';

import { useParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useProjectSprints, useSprintBurndown } from '@/hooks/use-project-sprints';
import { BurndownChart } from '@/components/projects/burndown-chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/**
 * Informe dedicado de burndown, al estilo "un informe = una pagina" (misma
 * idea que las paginas de Jira que sirvieron de referencia): un selector de
 * Sprint arriba y el mismo BurndownChart real que ya se usa en la analitica
 * del Sprint (`[sprintId]/analytics`), sin el resto de metricas alrededor.
 */
export default function InformeBurndownPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const router = useRouter();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { sprints, isLoading: cargandoSprints } = useProjectSprints(idProyecto);
  const { burndown, isLoading, isError, error, refetch } = useSprintBurndown(idProyecto, idSprint);
  const sprintActual = sprints.find((s) => s.idSprint === idSprint);

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints/analytics`, label: 'Volver a Analítica comparativa' }}
        title="Gráfica de trabajo pendiente del Sprint"
        description="Da seguimiento al trabajo restante de este Sprint día a día frente a la línea ideal de entrega."
        actions={
          !cargandoSprints && sprints.length > 0 ? (
            <Select value={String(idSprint)} onValueChange={(v) => router.push(`/dashboard/proyectos/${id}/sprints/${v}/informes/burndown`)}>
              <SelectTrigger aria-label="Elegir Sprint" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sprints.map((s) => (
                  <SelectItem key={s.idSprint} value={String(s.idSprint)}>
                    Sprint {s.numero}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      >
        {sprintActual && (
          <p className="type-meta text-text-secondary">
            {new Date(sprintActual.fechaInicio).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
            {sprintActual.fechaCierre &&
              ` – ${new Date(sprintActual.fechaCierre).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        )}
      </ProjectPageHeader>

      {isLoading && <Skeleton className="h-[400px] w-full rounded-xl" />}

      {!isLoading && isError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'general', 'No fue posible cargar el burndown de este Sprint.')}</EmptyTitle>
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

      {!isLoading && !isError && burndown && <BurndownChart burndown={burndown} />}
    </ProjectPageShell>
  );
}
