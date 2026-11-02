'use client';

import { AlertCircle, FolderOpen } from 'lucide-react';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useProyectosAsociacion } from '@/hooks/use-asociaciones';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
const ESTADO: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  PUBLICADO: 'Publicado',
  EN_PROGRESO: 'En progreso',
  EN_SOLICITUD_CIERRE: 'Solicitud de cierre',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

function Avance({ etiqueta, pct }: { etiqueta: string; pct: number }) {
  return (
    <div className="min-w-32">
      <p className="type-meta tabular-nums">
        {etiqueta}: <span className="font-semibold text-text-primary">{pct} %</span>
      </p>
      <Progress value={pct} aria-label={`${etiqueta}: ${pct} %`} className="mt-1 h-1.5" />
    </div>
  );
}

/** Proyectos publicados a nombre de la asociación, con avance de tareas y de sprints, integrantes y horas acreditadas. */
export function AsociacionProyectos({ idAsociacion }: { idAsociacion: number }) {
  const { data, isLoading, isError, refetch } = useProyectosAsociacion(idAsociacion);

  if (isError) {
    return (
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No pudimos cargar los proyectos</EmptyTitle>
          <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (isLoading) {
    return (
      <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando proyectos de la asociación">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="m-stack h-16" />
        ))}
      </SkeletonRegion>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Empty tone="muted" role="status">
        <EmptyMedia variant="icon">
          <FolderOpen aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Aún no hay proyectos de la asociación</EmptyTitle>
          <EmptyDescription>
            El Presidente y los Editores de la junta pueden crear uno y elegir «a nombre de la asociación» en el primer paso.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={DATA_TABLE_CARD}>
      <Table>
        <caption className="sr-only">Proyectos publicados a nombre de la asociación</caption>
        <TableHeader>
          <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
            <TableHead scope="col" className={TH}>
              Proyecto
            </TableHead>
            <TableHead scope="col" className={TH}>
              Avance
            </TableHead>
            <TableHead scope="col" className={TH}>
              Integrantes
            </TableHead>
            <TableHead scope="col" className={TH}>
              Horas acreditadas
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((p) => (
            <TableRow key={p.idProyecto} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
              <TableCell className={`${TD} min-w-44`}>
                <p className="type-body font-semibold">{p.titulo}</p>
                <Tag tone="slate" size="sm" className="mt-tight">
                  {ESTADO[p.estado] ?? p.estado}
                </Tag>
              </TableCell>
              <TableCell className={TD}>
                <div className="flex flex-col gap-tight">
                  <Avance etiqueta="Tareas" pct={p.avanceTareasPct} />
                  <Avance etiqueta="Sprints" pct={p.avanceSprintsPct} />
                </div>
              </TableCell>
              <TableCell className={`${TD} tabular-nums`}>{p.integrantes}</TableCell>
              <TableCell className={`${TD} tabular-nums`}>{p.horasAcreditadas} h</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
