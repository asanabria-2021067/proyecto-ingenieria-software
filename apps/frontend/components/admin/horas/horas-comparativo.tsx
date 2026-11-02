import { AlertCircle, History } from 'lucide-react';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
} from '@/components/dashboard/data-table';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useHorasComparativo } from '@/hooks/use-admin-horas';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-top tabular-nums';

/** MEJ-72: los últimos semestres lado a lado; declaradas y acreditadas siempre en columnas distintas. */
export function HorasComparativo() {
  const { data, isLoading, isError, refetch } = useHorasComparativo();

  return (
    <section aria-labelledby="horas-comparativo-titulo" className="flex flex-col gap-inline">
      <h2 id="horas-comparativo-titulo" className="type-section">
        Comparativo de semestres
      </h2>
      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No pudimos cargar el comparativo</EmptyTitle>
            <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando el comparativo de semestres">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="m-stack h-10" />
          ))}
        </SkeletonRegion>
      ) : data.semestres.every((s) => s.estudiantesConRegistro === 0 && s.becaAcreditada + s.extensionAcreditada === 0) ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <History aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay horas en estos semestres</EmptyTitle>
            <EmptyDescription>El comparativo aparece cuando los estudiantes registran o acreditan horas.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={DATA_TABLE_CARD}>
          <Table>
            <caption className="sr-only">Horas de todos los estudiantes por semestre</caption>
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>Semestre</TableHead>
                <TableHead scope="col" className={TH}>Con registro</TableHead>
                <TableHead scope="col" className={TH}>Beca: meta</TableHead>
                <TableHead scope="col" className={TH}>Beca: declaradas</TableHead>
                <TableHead scope="col" className={TH}>Beca: acreditadas</TableHead>
                <TableHead scope="col" className={TH}>Extensión: meta</TableHead>
                <TableHead scope="col" className={TH}>Extensión: declaradas</TableHead>
                <TableHead scope="col" className={TH}>Extensión: acreditadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.semestres.map((s) => (
                <TableRow key={`${s.semestre.anio}-${s.semestre.periodo}`} className={DATA_TABLE_ROW_BORDER}>
                  <TableCell className={`${TD} min-w-32 font-semibold`}>
                    {s.semestre.periodo === 1 ? '1.er' : '2.º'} semestre {s.semestre.anio}
                  </TableCell>
                  <TableCell className={TD}>{s.estudiantesConRegistro}</TableCell>
                  <TableCell className={TD}>{s.metaBeca} h</TableCell>
                  <TableCell className={TD}>{s.becaDeclarada} h</TableCell>
                  <TableCell className={TD}>{s.becaAcreditada} h</TableCell>
                  <TableCell className={TD}>{s.metaExtension} h</TableCell>
                  <TableCell className={TD}>{s.extensionDeclarada} h</TableCell>
                  <TableCell className={TD}>{s.extensionAcreditada} h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
