'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import {
  useProjectSprints,
  useSprintBurndown,
  useSprintColumnTime,
  useSprintDetail,
} from '@/hooks/use-project-sprints';
import {
  SERIES,
  SprintReportChart,
  estimadasContraReales,
  horasPorIntegrante,
  tareasPorEstadoEnElTiempo,
  tiempoPorColumna,
} from '@/components/projects/sprint-report-chart';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/**
 * MEJ-120: informes de equipo y tiempo de un Sprint. Reutiliza los endpoints
 * existentes (detalle del Sprint y burndown) más el de tiempo por columna;
 * cada consulta aplica su propio permiso en el backend.
 */
export default function InformeGraficasSprintPage() {
  const { id, sprintId } = useParams<{ id: string; sprintId: string }>();
  const router = useRouter();
  const idProyecto = Number(id);
  const idSprint = Number(sprintId);

  const { sprints } = useProjectSprints(idProyecto);
  const detalle = useSprintDetail(idProyecto, idSprint);
  const burndown = useSprintBurndown(idProyecto, idSprint);
  const columnas = useSprintColumnTime(idProyecto, idSprint);

  const porIntegrante = useMemo(() => (detalle.detail ? horasPorIntegrante(detalle.detail) : []), [detalle.detail]);
  const estimadasReales = useMemo(() => (detalle.detail ? estimadasContraReales(detalle.detail) : []), [detalle.detail]);
  const porEstado = useMemo(() => (burndown.burndown ? tareasPorEstadoEnElTiempo(burndown.burndown) : []), [burndown.burndown]);
  const porColumna = useMemo(() => (columnas.data ? tiempoPorColumna(columnas.data) : []), [columnas.data]);

  const cargando = detalle.isLoading || burndown.isLoading || columnas.isLoading;
  const error = detalle.error ?? burndown.error ?? columnas.error;
  const hayError = detalle.isError || burndown.isError || columnas.isError;

  return (
    <ProjectPageShell>
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${id}/sprints/analytics`, label: 'Volver a Analítica comparativa' }}
        title="Informes del Sprint"
        description="Horas por integrante, tareas por estado, tiempo en cada columna y horas estimadas contra reales."
        actions={
          sprints.length > 0 ? (
            <Select
              value={String(idSprint)}
              onValueChange={(v) => router.push(`/dashboard/proyectos/${id}/sprints/${v}/informes/graficas`)}
            >
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
      />

      {cargando && (
        <SkeletonRegion label="Cargando informes">
          <Skeleton className="h-[340px] w-full rounded-xl" />
        </SkeletonRegion>
      )}

      {!cargando && hayError && (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(error, 'general', 'No fue posible cargar los informes de este Sprint.')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              onClick={() => {
                detalle.refetch();
                burndown.refetch();
                columnas.refetch();
              }}
            >
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!cargando && !hayError && (
        <div className="grid gap-grid @2xl/project:grid-cols-2">
          <SprintReportChart
            titulo="Horas por integrante"
            datos={porIntegrante}
            ejeX="integrante"
            series={SERIES.horas}
            vacio="Aún no hay horas reportadas en este Sprint."
          />
          <SprintReportChart
            titulo="Tareas por estado a lo largo del Sprint"
            datos={porEstado}
            ejeX="fecha"
            series={SERIES.estados}
            apilado
            vacio="Aún no hay instantáneas diarias de este Sprint."
          />
          <SprintReportChart
            titulo="Tiempo promedio por columna (horas)"
            datos={porColumna}
            ejeX="columna"
            series={SERIES.columnas}
            vacio="Aún no hay movimientos de tareas en este Sprint."
          />
          <SprintReportChart
            titulo="Horas estimadas contra reales"
            datos={estimadasReales}
            ejeX="tarea"
            series={SERIES.estimadasReales}
            vacio="Ninguna tarea de este Sprint tiene horas estimadas."
          />
        </div>
      )}
    </ProjectPageShell>
  );
}
