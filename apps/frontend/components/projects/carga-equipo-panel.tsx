'use client';

import { useQuery } from '@tanstack/react-query';
import { DATA_TABLE_CARD, DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, DATA_TABLE_ROW_BORDER } from '@/components/dashboard/data-table';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCargaEquipo } from '@/lib/services/equipo';

const TH = `h-auto whitespace-nowrap px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-middle tabular-nums';
const horas = (n: number) => `${n.toLocaleString('es-GT', { maximumFractionDigits: 2 })} h`;

/** Carga del equipo: tareas abiertas y horas de la semana y del Sprint por integrante. Líder, coordinador y admin. */
export function CargaEquipoPanel({ idProyecto }: { idProyecto: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['carga-equipo', idProyecto],
    queryFn: () => getCargaEquipo(idProyecto),
  });

  return (
    <section aria-labelledby="carga-equipo-titulo" className="flex flex-col gap-inline">
      <h2 id="carga-equipo-titulo" className="type-section">
        Carga del equipo
      </h2>
      {isError ? (
        <p role="alert" className="type-body text-error">
          No pudimos cargar la carga del equipo.
        </p>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando carga del equipo">
          <Skeleton className="m-stack h-16" />
        </SkeletonRegion>
      ) : data.integrantes.length === 0 ? (
        <p className="type-body text-text-secondary">No hay integrantes activos.</p>
      ) : (
        <div className={DATA_TABLE_CARD}>
          <Table containerLabel="Carga del equipo por integrante">
            <caption className="sr-only">
              Tareas abiertas y horas registradas por integrante, de la semana del {data.semana.desde} al {data.semana.hasta}
              {data.sprintActivo ? ` y del Sprint ${data.sprintActivo.numero}` : ''}
            </caption>
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>Integrante</TableHead>
                <TableHead scope="col" className={TH}>Tareas abiertas</TableHead>
                <TableHead scope="col" className={TH}>Horas esta semana</TableHead>
                <TableHead scope="col" className={TH}>
                  {data.sprintActivo ? `Horas en el Sprint ${data.sprintActivo.numero}` : 'Horas en el Sprint'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.integrantes.map((i) => (
                <TableRow key={i.idUsuario} className={DATA_TABLE_ROW_BORDER}>
                  <TableCell className={`${TD} font-semibold`}>{i.nombre} {i.apellido}</TableCell>
                  <TableCell className={TD}>{i.tareasAbiertas}</TableCell>
                  <TableCell className={TD}>{horas(i.horasSemana)}</TableCell>
                  <TableCell className={TD}>{data.sprintActivo ? horas(i.horasSprint) : 'Sin Sprint activo'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
